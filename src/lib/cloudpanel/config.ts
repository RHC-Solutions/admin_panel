/**
 * CloudPanel module configuration.
 *
 * CloudPanel has NO REST API — every management command is the `clpctl` CLI and
 * (per CloudPanel's own docs) essentially all of them require root. This panel
 * runs as an unprivileged site user, so the module talks to CloudPanel two ways:
 *
 *   read  → CloudPanel's own SQLite DB, opened READ-ONLY (see inventory.ts)
 *   write → a root-owned wrapper script invoked via sudo (see clpctl.ts)
 *
 * Both are OFF by default. The panel vendors into arbitrary hosts, most of which
 * are not CloudPanel servers, so nothing here may assume RHC's layout — every
 * path is configurable and the defaults are only CloudPanel's documented ones.
 *
 * Precedence: env var > module_settings row > default. Env wins so an operator
 * can pin paths in .env.local and stop the admin UI from moving them.
 */

import { getModuleSetting, setModuleSetting } from '../module-settings';

export const CLOUDPANEL_SETTING_KEY = 'cloudpanel.config';

/** CloudPanel's documented data + binary locations. */
const DEFAULT_DB_PATH = '/home/clp/htdocs/app/data/db.sq3';
const DEFAULT_WRAPPER_PATH = '/usr/local/bin/rhc-clpctl';

export interface CloudPanelConfig {
  /** Master switch. Nothing in this module does anything while false. */
  enabled: boolean;
  /** Path to CloudPanel's SQLite database (read-only inventory source). */
  dbPath: string;
  /** Path to the root-owned allowlist wrapper that fronts clpctl. */
  wrapperPath: string;
  /** Invoke the wrapper through `sudo` (the normal setup). */
  useSudo: boolean;
  /**
   * Second switch, separate from `enabled`, that unlocks the destructive verbs
   * (site:delete, user:delete, certificate replacement). Deliberately its own
   * flag: enabling read + provisioning must not silently enable deletion.
   */
  allowDestructive: boolean;
  /** Hard timeout for a single clpctl invocation. */
  timeoutMs: number;
}

export const DEFAULT_CONFIG: CloudPanelConfig = {
  enabled: false,
  dbPath: DEFAULT_DB_PATH,
  wrapperPath: DEFAULT_WRAPPER_PATH,
  useSudo: true,
  allowDestructive: false,
  timeoutMs: 120_000,
};

function envBool(key: string): boolean | undefined {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return undefined;
  return raw === '1' || raw.toLowerCase() === 'true';
}

/**
 * Absolute paths only. A relative path here would resolve against the Next
 * process CWD, which is attacker-influenced in exactly the wrong direction —
 * it would let a `dbPath` of `cms-data/cms.db` point the reader at our own DB.
 */
function cleanPath(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (!v || !v.startsWith('/') || v.includes('\0')) return fallback;
  return v;
}

export async function getCloudPanelConfig(): Promise<CloudPanelConfig> {
  const stored = await getModuleSetting<Partial<CloudPanelConfig>>(CLOUDPANEL_SETTING_KEY, {});
  const timeout = Number(stored.timeoutMs);
  return {
    enabled: envBool('CLOUDPANEL_ENABLED') ?? stored.enabled ?? DEFAULT_CONFIG.enabled,
    dbPath: cleanPath(process.env.CLOUDPANEL_DB_PATH || stored.dbPath, DEFAULT_CONFIG.dbPath),
    wrapperPath: cleanPath(
      process.env.CLOUDPANEL_WRAPPER_PATH || stored.wrapperPath,
      DEFAULT_CONFIG.wrapperPath,
    ),
    useSudo: envBool('CLOUDPANEL_USE_SUDO') ?? stored.useSudo ?? DEFAULT_CONFIG.useSudo,
    allowDestructive:
      envBool('CLOUDPANEL_ALLOW_DESTRUCTIVE') ??
      stored.allowDestructive ??
      DEFAULT_CONFIG.allowDestructive,
    timeoutMs:
      Number.isFinite(timeout) && timeout >= 1_000 && timeout <= 600_000
        ? timeout
        : DEFAULT_CONFIG.timeoutMs,
  };
}

/** Persist a partial config change. Unknown keys are dropped, not merged. */
export async function setCloudPanelConfig(
  patch: Partial<CloudPanelConfig>,
): Promise<CloudPanelConfig> {
  const current = await getCloudPanelConfig();
  const next: CloudPanelConfig = {
    enabled: typeof patch.enabled === 'boolean' ? patch.enabled : current.enabled,
    dbPath: cleanPath(patch.dbPath, current.dbPath),
    wrapperPath: cleanPath(patch.wrapperPath, current.wrapperPath),
    useSudo: typeof patch.useSudo === 'boolean' ? patch.useSudo : current.useSudo,
    allowDestructive:
      typeof patch.allowDestructive === 'boolean' ? patch.allowDestructive : current.allowDestructive,
    timeoutMs: current.timeoutMs,
  };
  await setModuleSetting(CLOUDPANEL_SETTING_KEY, next);
  return next;
}
