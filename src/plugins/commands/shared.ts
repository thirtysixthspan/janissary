import {
  APPLICATION_COMMAND_KINDS,
  APPLICATION_COMMAND_NATIVE_TOOLS,
  APPLICATION_COMMAND_SOURCES,
  type ApplicationCommandNativeTool,
  type ApplicationCommandSource,
} from '../../shared/application-commands.js';

export const COMMANDS_PAYLOAD_SCHEMA_VERSION = 1;

export type CommandSettingsSource = ApplicationCommandSource;
export type CommandSettingName = 'enabled' | 'agentAccess';
export type NativeTool = ApplicationCommandNativeTool;

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
  overridden?: string[];
};

export type SetIntent = { name: string; setting: CommandSettingName; value: boolean };

// Hand-written rather than imported, per the plugin architecture's rule that a shared contract stays
// import-free: the client reaches this module through `@shared/plugins/commands/shared`, so any import
// here is a runtime dependency from a browser chunk into a server module.
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonemptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export const SOURCES: ReadonlySet<string> = new Set(APPLICATION_COMMAND_SOURCES);
export const NATIVE_TOOLS: ReadonlySet<string> = new Set(APPLICATION_COMMAND_NATIVE_TOOLS);
export const KINDS: ReadonlySet<string> = new Set(APPLICATION_COMMAND_KINDS);

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
    && (value.problem === undefined || typeof value.problem === 'string')
    && (value.overridden === undefined || isStringList(value.overridden));
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isRefreshIntent(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function isSetIntent(value: unknown): value is SetIntent {
  return isRecord(value)
    && isNonemptyString(value.name)
    && (value.setting === 'enabled' || value.setting === 'agentAccess')
    && typeof value.value === 'boolean';
}
