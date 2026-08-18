'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FaServer,
  FaSync,
  FaPlay,
  FaEye,
  FaExclamationTriangle,
  FaCheckCircle,
  FaLock,
  FaDatabase,
  FaUsers,
  FaGlobe,
} from 'react-icons/fa';
import AdminShell from '@adminpanel/components/admin/AdminShell';
import { useToast } from '@adminpanel/components/admin/Toast';

interface FlagDescriptor {
  name: string;
  required: boolean;
  secret: boolean;
  boolean: boolean;
  hint: string;
}
interface CommandDescriptor {
  command: string;
  summary: string;
  destructive: boolean;
  flags: FlagDescriptor[];
}
interface Config {
  enabled: boolean;
  dbPath: string;
  wrapperPath: string;
  useSudo: boolean;
  allowDestructive: boolean;
  timeoutMs: number;
}
interface Site {
  id: string | null;
  domainName: string | null;
  siteUser: string | null;
  rootDirectory: string | null;
  application: string | null;
  phpVersion: string | null;
  createdAt: string | null;
}
interface PanelUser {
  id: string | null;
  userName: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
}
interface Db {
  id: string | null;
  name: string | null;
  siteId: string | null;
}
interface Inventory {
  status: string;
  message?: string;
  sites: Site[];
  users: PanelUser[];
  databases: Db[];
  schema: {
    dbPath: string;
    tables: string[];
    siteTable: string | null;
    userTable: string | null;
    databaseTable: string | null;
  };
}
interface RunResult {
  ok: boolean;
  argv: string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  dryRun: boolean;
  error?: string;
}

const CONFIRM_KEYS = ['domainName', 'userName', 'databaseName'];

export default function CloudPanelPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [commands, setCommands] = useState<CommandDescriptor[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState('');
  const [params, setParams] = useState<Record<string, string | boolean>>({});
  const [confirm, setConfirm] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);

  const { addToast } = useToast();

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cms/cloudpanel');
      if (!res.ok) {
        addToast('error', res.status === 401 ? 'Admin access required' : 'Failed to load CloudPanel state');
        return;
      }
      const data = await res.json();
      setConfig(data.config);
      setInventory(data.inventory);
      setCommands(data.commands || []);
      setExcluded(data.excludedCommands || []);
    } catch {
      addToast('error', 'Failed to load CloudPanel state');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const saveConfig = async (patch: Partial<Config>) => {
    setSaving(true);
    try {
      const res = await fetch('/api/cms/cloudpanel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'config', config: patch }),
      });
      const data = await res.json();
      if (!res.ok) {
        addToast('error', data.error || 'Failed to save');
        return;
      }
      setConfig(data.config);
      addToast('success', 'Configuration saved');
      load();
    } catch {
      addToast('error', 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const spec = useMemo(() => commands.find((c) => c.command === selected) || null, [commands, selected]);

  // The value the operator must retype for a destructive command.
  const confirmTarget = useMemo(() => {
    if (!spec?.destructive) return null;
    for (const key of CONFIRM_KEYS) {
      const v = params[key];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  }, [spec, params]);

  const run = async (dryRun: boolean) => {
    if (!spec) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await fetch('/api/cms/cloudpanel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run',
          command: spec.command,
          params,
          dryRun,
          confirm: dryRun ? undefined : confirm,
        }),
      });
      const data = await res.json();
      if (!res.ok && data?.error && !data?.argv) {
        addToast('error', data.error);
        setResult(null);
        return;
      }
      setResult(data);
      if (dryRun) addToast('info', 'Dry run — nothing was executed');
      else if (data.ok) {
        addToast('success', `${spec.command} completed`);
        setConfirm('');
        load();
      } else addToast('error', data.error || 'Command failed');
    } catch {
      addToast('error', 'Request failed');
    } finally {
      setRunning(false);
    }
  };

  const statusTone = (status?: string) =>
    status === 'ok'
      ? 'bg-green-900/40 border-green-700 text-green-200'
      : status === 'disabled'
        ? 'bg-gray-800 border-gray-700 text-gray-300'
        : 'bg-yellow-900/40 border-yellow-700 text-yellow-100';

  if (loading) {
    return (
      <AdminShell title="CloudPanel">
        <div className="p-8 text-center text-gray-400">Loading CloudPanel…</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="CloudPanel">
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="heading-xl text-gradient mb-2 flex items-center gap-3">
              <FaServer /> CloudPanel
            </h1>
            <p className="text-gray-400 mt-2">
              Manage sites, databases and panel users on the CloudPanel server this panel runs on.
            </p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg font-semibold transition"
          >
            <FaSync /> Refresh
          </button>
        </div>

        {/* Connection status */}
        <div className={`border rounded-lg p-4 ${statusTone(inventory?.status)}`}>
          <div className="flex items-center gap-2 font-semibold">
            {inventory?.status === 'ok' ? <FaCheckCircle /> : <FaExclamationTriangle />}
            {inventory?.status === 'ok'
              ? `Connected — ${inventory.sites.length} site(s), ${inventory.users.length} panel user(s)`
              : inventory?.message || 'CloudPanel not connected'}
          </div>
          {inventory?.status !== 'ok' && (
            <p className="text-sm mt-2 opacity-90">
              Setup instructions live in <code className="font-mono">docs/CLOUDPANEL.md</code>. Write actions
              work independently of database access.
            </p>
          )}
        </div>

        {/* Configuration */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-green-400">Configuration</h2>

          <label className="flex items-center gap-3 text-gray-200">
            <input
              type="checkbox"
              checked={!!config?.enabled}
              disabled={saving}
              onChange={(e) => saveConfig({ enabled: e.target.checked })}
              className="w-4 h-4"
            />
            <span>
              <span className="font-medium">Enable the CloudPanel module</span>
              <span className="block text-sm text-gray-400">
                Off by default. Nothing reads or executes while disabled.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-3 text-gray-200">
            <input
              type="checkbox"
              checked={!!config?.allowDestructive}
              disabled={saving || !config?.enabled}
              onChange={(e) => saveConfig({ allowDestructive: e.target.checked })}
              className="w-4 h-4"
            />
            <span>
              <span className="font-medium text-red-300">Allow destructive commands</span>
              <span className="block text-sm text-gray-400">
                site:delete, user:delete, db:import, certificate replacement. Also requires the root-owned
                marker file <code className="font-mono">/etc/rhc-clpctl-allow-destructive</code> on the host —
                this switch alone is not enough.
              </span>
            </span>
          </label>

          <label className="flex items-center gap-3 text-gray-200">
            <input
              type="checkbox"
              checked={!!config?.useSudo}
              disabled={saving || !config?.enabled}
              onChange={(e) => saveConfig({ useSudo: e.target.checked })}
              className="w-4 h-4"
            />
            <span className="font-medium">Invoke the wrapper through sudo</span>
          </label>

          <div className="grid md:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-sm text-gray-400 mb-1">CloudPanel database (read-only)</label>
              <input
                defaultValue={config?.dbPath || ''}
                onBlur={(e) => e.target.value !== config?.dbPath && saveConfig({ dbPath: e.target.value })}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Root wrapper path</label>
              <input
                defaultValue={config?.wrapperPath || ''}
                onBlur={(e) =>
                  e.target.value !== config?.wrapperPath && saveConfig({ wrapperPath: e.target.value })
                }
                className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 font-mono text-sm"
              />
            </div>
          </div>
        </div>

        {/* Sites */}
        <Section title="Sites" icon={<FaGlobe />} count={inventory?.sites.length ?? 0}>
          <Table
            headers={['Domain', 'Site user', 'Type', 'PHP', 'Root directory']}
            rows={(inventory?.sites || []).map((s) => [
              s.domainName ?? '—',
              s.siteUser ?? '—',
              s.application ?? '—',
              s.phpVersion ?? '—',
              s.rootDirectory ?? '—',
            ])}
            empty="No sites readable. Check database access in docs/CLOUDPANEL.md."
          />
        </Section>

        {/* Panel users */}
        <Section title="Panel users" icon={<FaUsers />} count={inventory?.users.length ?? 0}>
          <Table
            headers={['Username', 'Email', 'Role', 'Status']}
            rows={(inventory?.users || []).map((u) => [
              u.userName ?? '—',
              u.email ?? '—',
              u.role ?? '—',
              u.status ?? '—',
            ])}
            empty="No panel users readable."
          />
        </Section>

        {/* Databases */}
        <Section title="Databases" icon={<FaDatabase />} count={inventory?.databases.length ?? 0}>
          <Table
            headers={['Name', 'Site ID']}
            rows={(inventory?.databases || []).map((d) => [d.name ?? '—', d.siteId ?? '—'])}
            empty="No databases readable."
          />
        </Section>

        {/* Command runner */}
        <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-green-400">Run a command</h2>
          <p className="text-sm text-gray-400">
            Every command is allowlisted and executed without a shell. Preview first — it shows the exact
            argument list, with passwords masked.
          </p>

          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setParams({});
              setConfirm('');
              setResult(null);
            }}
            disabled={!config?.enabled}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200"
          >
            <option value="">Select a command…</option>
            {commands.map((c) => (
              <option key={c.command} value={c.command}>
                {c.destructive ? '⚠ ' : ''}
                {c.command} — {c.summary}
              </option>
            ))}
          </select>

          {spec && (
            <>
              {spec.destructive && (
                <div className="bg-red-900/40 border border-red-700 rounded p-3 text-red-100 text-sm flex gap-2">
                  <FaLock className="mt-0.5 shrink-0" />
                  <span>
                    Destructive. Requires the “Allow destructive commands” switch above, the root-owned marker
                    file on the host, and retyping the target below.
                  </span>
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                {spec.flags.map((flag) =>
                  flag.boolean ? (
                    <label key={flag.name} className="flex items-center gap-2 text-gray-200 self-end">
                      <input
                        type="checkbox"
                        checked={params[flag.name] === true}
                        onChange={(e) => setParams((p) => ({ ...p, [flag.name]: e.target.checked }))}
                        className="w-4 h-4"
                      />
                      <span className="font-mono text-sm">--{flag.name}</span>
                    </label>
                  ) : (
                    <div key={flag.name}>
                      <label className="block text-sm text-gray-300 mb-1 font-mono">
                        --{flag.name}
                        {flag.required && <span className="text-red-400"> *</span>}
                      </label>
                      <input
                        type={flag.secret ? 'password' : 'text'}
                        autoComplete="new-password"
                        value={(params[flag.name] as string) || ''}
                        placeholder={flag.hint}
                        onChange={(e) => setParams((p) => ({ ...p, [flag.name]: e.target.value }))}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded text-gray-200 text-sm"
                      />
                    </div>
                  ),
                )}
              </div>

              {spec.destructive && (
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Retype <span className="font-mono text-red-300">{confirmTarget || 'the target'}</span> to
                    confirm
                  </label>
                  <input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full px-3 py-2 bg-gray-800 border border-red-800 rounded text-gray-200 text-sm"
                  />
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => run(true)}
                  disabled={running}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-gray-100 rounded-lg font-semibold transition"
                >
                  <FaEye /> Preview
                </button>
                <button
                  onClick={() => run(false)}
                  disabled={
                    running ||
                    !config?.enabled ||
                    (spec.destructive && (!confirmTarget || confirm !== confirmTarget))
                  }
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition disabled:opacity-50 ${
                    spec.destructive
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-green-500 hover:bg-green-600 text-black'
                  }`}
                >
                  <FaPlay /> {running ? 'Running…' : 'Run'}
                </button>
              </div>
            </>
          )}

          {result && (
            <div className="space-y-3 pt-2">
              <div>
                <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                  {result.dryRun ? 'Would run (dry run)' : 'Executed'}
                </div>
                <pre className="bg-black/60 border border-gray-800 rounded p-3 text-xs text-green-300 overflow-x-auto whitespace-pre-wrap break-all">
                  clpctl {result.argv.join(' ')}
                </pre>
              </div>
              {!result.dryRun && (
                <div className="text-sm text-gray-400">
                  exit {result.exitCode ?? '—'} · {result.durationMs} ms
                </div>
              )}
              {result.error && (
                <pre className="bg-red-950/60 border border-red-800 rounded p-3 text-xs text-red-200 overflow-x-auto whitespace-pre-wrap">
                  {result.error}
                </pre>
              )}
              {result.stdout && (
                <pre className="bg-black/60 border border-gray-800 rounded p-3 text-xs text-gray-300 overflow-x-auto whitespace-pre-wrap">
                  {result.stdout}
                </pre>
              )}
            </div>
          )}

          {excluded.length > 0 && (
            <p className="text-xs text-gray-500 pt-2 border-t border-gray-800">
              Intentionally not available here: <span className="font-mono">{excluded.join(', ')}</span> — see
              docs/CLOUDPANEL.md for why.
            </p>
          )}
        </div>

        {/* Diagnostics */}
        {inventory && (
          <details className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <summary className="cursor-pointer text-gray-300 font-medium">Diagnostics</summary>
            <div className="mt-3 text-sm text-gray-400 space-y-1 font-mono">
              <div>db: {inventory.schema.dbPath}</div>
              <div>site table: {inventory.schema.siteTable ?? '(not found)'}</div>
              <div>user table: {inventory.schema.userTable ?? '(not found)'}</div>
              <div>database table: {inventory.schema.databaseTable ?? '(not found)'}</div>
              <div className="break-all">tables: {inventory.schema.tables.join(', ') || '(none)'}</div>
            </div>
          </details>
        )}
      </div>
    </AdminShell>
  );
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      <div className="px-6 py-3 border-b border-gray-800 flex items-center gap-2 text-green-400 font-semibold">
        {icon} {title} <span className="text-gray-500 font-normal">({count})</span>
      </div>
      {children}
    </div>
  );
}

function Table({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: string[][];
  empty: string;
}) {
  if (rows.length === 0) return <div className="p-6 text-center text-gray-500 text-sm">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-800 border-b border-gray-700">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-6 py-3 text-left text-green-400 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-800/60 transition">
              {row.map((cell, j) => (
                <td key={j} className="px-6 py-3 text-gray-300 font-mono text-xs">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
