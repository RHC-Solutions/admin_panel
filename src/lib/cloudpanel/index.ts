/**
 * CloudPanel module — read via CloudPanel's SQLite DB, write via allowlisted
 * clpctl through a root wrapper. Off by default; see docs/CLOUDPANEL.md.
 */

export {
  getCloudPanelConfig,
  setCloudPanelConfig,
  DEFAULT_CONFIG,
  CLOUDPANEL_SETTING_KEY,
  type CloudPanelConfig,
} from './config';

export {
  readInventory,
  type CloudPanelInventory,
  type CloudPanelSite,
  type CloudPanelUser,
  type CloudPanelDatabase,
  type InventoryStatus,
} from './inventory';

export {
  runCommand,
  buildCommand,
  listCommands,
  COMMANDS,
  EXCLUDED_COMMANDS,
  ClpctlValidationError,
  isDomain,
  type CommandSpec,
  type CommandDescriptor,
  type ExecResult,
} from './clpctl';
