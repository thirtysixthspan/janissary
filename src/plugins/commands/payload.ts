import type { CommandsTopicNotification } from '../api.js';
import type { CommandRow, CommandsPayload } from './shared.js';

type SourceCommand = CommandsTopicNotification['data']['commands'][number];

const KINDS = new Set(['builtin', 'plugin', 'help', 'native']);
const NATIVE_TOOLS = new Set(['database', 'browser', 'question']);
const SOURCES = new Set(['home', 'project', 'default']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSourceCommand(value: unknown): value is SourceCommand {
  return isRecord(value)
    && typeof value.name === 'string'
    && typeof value.kind === 'string' && KINDS.has(value.kind)
    && isStringList(value.aliases)
    && isStringList(value.forms)
    && (value.parent === undefined || typeof value.parent === 'string')
    && (value.nativeTool === undefined
      || (typeof value.nativeTool === 'string' && NATIVE_TOOLS.has(value.nativeTool)))
    && typeof value.enabled === 'boolean'
    && typeof value.agentAccess === 'boolean'
    && typeof value.effectiveEnabled === 'boolean'
    && typeof value.effectiveAgentAccess === 'boolean';
}

export function isCommandsData(data: unknown): data is CommandsTopicNotification['data'] {
  return isRecord(data)
    && Array.isArray(data.commands)
    && data.commands.every((row) => isSourceCommand(row))
    && typeof data.source === 'string' && SOURCES.has(data.source)
    && typeof data.path === 'string'
    && (data.problem === undefined || typeof data.problem === 'string');
}

function canonicalParent(rows: readonly SourceCommand[], parent: string): string {
  const match = rows.find((row) => row.name === parent
    || row.aliases.includes(parent)
    || row.forms.includes(parent));
  return match?.name ?? parent;
}

function labelFor(rows: readonly SourceCommand[], row: SourceCommand): string {
  if (row.forms.includes(row.name)) return row.name;
  const first = row.forms[0];
  if (first !== undefined && rows.some((candidate) => candidate.name === first)) return row.name;
  return first ?? row.name;
}

function toRow(rows: readonly SourceCommand[], row: SourceCommand): CommandRow {
  const parent = row.parent === undefined ? undefined : canonicalParent(rows, row.parent);
  return {
    name: row.name,
    label: labelFor(rows, row),
    enabled: row.enabled,
    agentAccess: row.agentAccess,
    effectiveEnabled: row.effectiveEnabled,
    effectiveAgentAccess: row.effectiveAgentAccess,
    ...(parent !== undefined && parent !== row.name && { parent }),
    ...(row.nativeTool !== undefined && { nativeTool: row.nativeTool }),
  };
}

export function toPayload(data: CommandsTopicNotification['data']): CommandsPayload {
  return {
    commands: data.commands.map((row) => toRow(data.commands, row)),
    source: data.source,
    path: data.path,
    ...(data.problem !== undefined && { problem: data.problem }),
  };
}
