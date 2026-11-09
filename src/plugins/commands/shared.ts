export const COMMANDS_PAYLOAD_SCHEMA_VERSION = 1;

export type CommandSettingsSource = 'home' | 'project' | 'default';
export type CommandSettingName = 'enabled' | 'agentAccess';
export type NativeTool = 'database' | 'browser' | 'question';

export type CommandRow = {
  name: string;
  label: string;
  enabled: boolean;
  agentAccess: boolean;
  effectiveEnabled: boolean;
  effectiveAgentAccess: boolean;
  parent?: string;
  nativeTool?: NativeTool;
};

export type CommandsPayload = {
  commands: CommandRow[];
  source: CommandSettingsSource;
  path: string;
  problem?: string;
};

export type SetIntent = { name: string; setting: CommandSettingName; value: boolean };

// Hand-written rather than imported, per the plugin architecture's rule that a shared contract stays
// import-free: the client reaches this module through `@shared/plugins/commands/shared`, so any import
// here is a runtime dependency from a browser chunk into a server module.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const SOURCES = new Set(['home', 'project', 'default']);
const NATIVE_TOOLS = new Set(['database', 'browser', 'question']);

function isSource(value: unknown): value is CommandSettingsSource {
  return typeof value === 'string' && SOURCES.has(value);
}

function isNativeTool(value: unknown): value is NativeTool {
  return typeof value === 'string' && NATIVE_TOOLS.has(value);
}

function isCommandRow(value: unknown): value is CommandRow {
  return isRecord(value)
    && isNonemptyString(value.name)
    && isNonemptyString(value.label)
    && typeof value.enabled === 'boolean'
    && typeof value.agentAccess === 'boolean'
    && typeof value.effectiveEnabled === 'boolean'
    && typeof value.effectiveAgentAccess === 'boolean'
    && (value.parent === undefined || isNonemptyString(value.parent))
    && (value.nativeTool === undefined || isNativeTool(value.nativeTool));
}

export function isCommandsPayload(value: unknown): value is CommandsPayload {
  return isRecord(value)
    && Array.isArray(value.commands)
    && value.commands.every(isCommandRow)
    && isSource(value.source)
    && typeof value.path === 'string'
    && (value.problem === undefined || typeof value.problem === 'string');
}

export function isSetIntent(value: unknown): value is SetIntent {
  return isRecord(value)
    && isNonemptyString(value.name)
    && (value.setting === 'enabled' || value.setting === 'agentAccess')
    && typeof value.value === 'boolean';
}
