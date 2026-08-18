/**
 * Read-only view of CloudPanel's own SQLite database.
 *
 * CloudPanel's schema is not part of any public contract — it is an internal
 * detail of a closed-source product and has changed across 1.x/2.x. So this
 * reader NEVER hardcodes a table or column name: it introspects `sqlite_master`
 * and `PRAGMA table_info`, then maps each logical field to the first candidate
 * column that actually exists. A CloudPanel upgrade that renames a column
 * degrades one field to null instead of throwing 500s across the page.
 *
 * The database is opened `readonly: true`. This module has no write path at all
 * — mutations go through clpctl (see clpctl.ts), never through direct SQL,
 * because writing behind CloudPanel's back would desync its nginx/vhost state.
 */

import Database from 'better-sqlite3';
import { getCloudPanelConfig } from './config';

export type InventoryStatus =
  | 'ok'
  | 'disabled'
  | 'not-found'
  | 'permission-denied'
  | 'unreadable-schema'
  | 'error';

export interface CloudPanelSite {
  id: string | null;
  domainName: string | null;
  siteUser: string | null;
  rootDirectory: string | null;
  application: string | null;
  phpVersion: string | null;
  createdAt: string | null;
}

export interface CloudPanelUser {
  id: string | null;
  userName: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
}

export interface CloudPanelDatabase {
  id: string | null;
  name: string | null;
  siteId: string | null;
}

export interface CloudPanelInventory {
  status: InventoryStatus;
  /** Operator-facing explanation when status !== 'ok'. */
  message?: string;
  sites: CloudPanelSite[];
  users: CloudPanelUser[];
  databases: CloudPanelDatabase[];
  /** Which tables/columns were actually discovered — surfaced in the UI to make
   *  a schema drift diagnosable instead of mysterious. */
  schema: {
    dbPath: string;
    tables: string[];
    siteTable: string | null;
    userTable: string | null;
    databaseTable: string | null;
  };
}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface ColumnInfo {
  name: string;
}

function listTables(db: Database.Database): string[] {
  const rows = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name).filter((n) => IDENT_RE.test(n));
}

function pickTable(tables: string[], candidates: string[]): string | null {
  const lower = new Map(tables.map((t) => [t.toLowerCase(), t]));
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

function listColumns(db: Database.Database, table: string): string[] {
  // `table` came from sqlite_master and passed IDENT_RE, so it is safe to
  // interpolate here — PRAGMA does not accept bound parameters.
  const rows = db.prepare(`PRAGMA table_info("${table}")`).all() as ColumnInfo[];
  return rows.map((r) => r.name).filter((n) => IDENT_RE.test(n));
}

function pickColumn(columns: string[], candidates: string[]): string | null {
  const lower = new Map(columns.map((c) => [c.toLowerCase(), c]));
  for (const c of candidates) {
    const hit = lower.get(c.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/**
 * Build `SELECT "col" AS "alias", NULL AS "other" FROM "table"` from a logical
 * field map, so missing columns come back as null rather than breaking the query.
 */
function selectMapped(
  db: Database.Database,
  table: string,
  fields: Record<string, string[]>,
  limit: number,
): Record<string, any>[] {
  const columns = listColumns(db, table);
  const resolved: Record<string, string | null> = {};
  const parts: string[] = [];
  for (const [alias, candidates] of Object.entries(fields)) {
    const col = pickColumn(columns, candidates);
    resolved[alias] = col;
    parts.push(col ? `"${col}" AS "${alias}"` : `NULL AS "${alias}"`);
  }
  if (Object.values(resolved).every((c) => c === null)) return [];
  return db.prepare(`SELECT ${parts.join(', ')} FROM "${table}" LIMIT ?`).all(limit) as Record<
    string,
    any
  >[];
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return String(v);
}

function classifyOpenError(err: any, dbPath: string): { status: InventoryStatus; message: string } {
  const code = err?.code || '';
  const msg = String(err?.message || err);
  if (code === 'ENOENT' || /unable to open database file/i.test(msg)) {
    // better-sqlite3 collapses "missing" and "cannot read" into one message, so
    // distinguishing them for the operator matters more than the raw error.
    return {
      status: 'not-found',
      message: `CloudPanel database not readable at ${dbPath}. Either the path is wrong, or the panel's user lacks read access — see docs/CLOUDPANEL.md.`,
    };
  }
  if (code === 'EACCES' || code === 'EPERM' || /permission denied/i.test(msg)) {
    return {
      status: 'permission-denied',
      message: `Permission denied reading ${dbPath}. Grant the panel's system user read access to the file and its -wal/-shm siblings.`,
    };
  }
  return { status: 'error', message: msg };
}

function emptySchema(dbPath: string): CloudPanelInventory['schema'] {
  return { dbPath, tables: [], siteTable: null, userTable: null, databaseTable: null };
}

export async function readInventory(): Promise<CloudPanelInventory> {
  const config = await getCloudPanelConfig();
  if (!config.enabled) {
    return {
      status: 'disabled',
      message: 'The CloudPanel module is disabled. Enable it on this page to connect.',
      sites: [],
      users: [],
      databases: [],
      schema: emptySchema(config.dbPath),
    };
  }

  let db: Database.Database | null = null;
  try {
    db = new Database(config.dbPath, { readonly: true, fileMustExist: true });
  } catch (err) {
    const { status, message } = classifyOpenError(err, config.dbPath);
    return { status, message, sites: [], users: [], databases: [], schema: emptySchema(config.dbPath) };
  }

  try {
    const tables = listTables(db);
    const siteTable = pickTable(tables, ['site', 'sites']);
    const userTable = pickTable(tables, ['user', 'users']);
    const databaseTable = pickTable(tables, ['database', 'databases']);

    if (!siteTable && !userTable && !databaseTable) {
      return {
        status: 'unreadable-schema',
        message: `Opened ${config.dbPath} but found none of the expected CloudPanel tables (site/user/database). Found: ${tables.join(', ') || '(none)'}.`,
        sites: [],
        users: [],
        databases: [],
        schema: { dbPath: config.dbPath, tables, siteTable, userTable, databaseTable },
      };
    }

    const sites: CloudPanelSite[] = siteTable
      ? selectMapped(
          db,
          siteTable,
          {
            id: ['id'],
            domainName: ['domain_name', 'domainName', 'domain'],
            siteUser: ['site_user', 'siteUser', 'user', 'system_user', 'username'],
            rootDirectory: ['root_directory', 'rootDirectory', 'document_root', 'home_directory'],
            application: ['application', 'type', 'site_type', 'vhost_template', 'vhostTemplate'],
            phpVersion: ['php_version', 'phpVersion'],
            createdAt: ['created_at', 'createdAt'],
          },
          500,
        ).map((r) => ({
          id: str(r.id),
          domainName: str(r.domainName),
          siteUser: str(r.siteUser),
          rootDirectory: str(r.rootDirectory),
          application: str(r.application),
          phpVersion: str(r.phpVersion),
          createdAt: str(r.createdAt),
        }))
      : [];

    // NOTE: no password/hash/2FA-secret column is ever selected here. The panel
    // has no business reading CloudPanel's credential material.
    const users: CloudPanelUser[] = userTable
      ? selectMapped(
          db,
          userTable,
          {
            id: ['id'],
            userName: ['user_name', 'userName', 'username', 'login'],
            email: ['email'],
            role: ['role'],
            status: ['status', 'enabled', 'active'],
          },
          200,
        ).map((r) => ({
          id: str(r.id),
          userName: str(r.userName),
          email: str(r.email),
          role: str(r.role),
          status: str(r.status),
        }))
      : [];

    const databases: CloudPanelDatabase[] = databaseTable
      ? selectMapped(
          db,
          databaseTable,
          { id: ['id'], name: ['name', 'database_name', 'databaseName'], siteId: ['site_id', 'siteId'] },
          200,
        ).map((r) => ({ id: str(r.id), name: str(r.name), siteId: str(r.siteId) }))
      : [];

    return {
      status: 'ok',
      sites,
      users,
      databases,
      schema: { dbPath: config.dbPath, tables, siteTable, userTable, databaseTable },
    };
  } catch (err) {
    console.error('[cloudpanel:inventory] read failed', err);
    return {
      status: 'error',
      message: (err as Error).message,
      sites: [],
      users: [],
      databases: [],
      schema: emptySchema(config.dbPath),
    };
  } finally {
    try {
      db?.close();
    } catch {
      /* closing a readonly handle can't lose data */
    }
  }
}
