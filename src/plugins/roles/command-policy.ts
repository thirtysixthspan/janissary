import { isRecord } from '../api.js';
import { NATIVE_ACP_COMMANDS, type CommandRestriction } from './shared.js';

const NATIVE = new Set<string>(NATIVE_ACP_COMMANDS);

type RowRead = { name: string; restriction?: CommandRestriction };

function readRow(row: unknown): RowRead | undefined {
  if (!isRecord(row)) return undefined;
  const { name, effectiveEnabled, effectiveAgentAccess } = row;
  if (typeof name !== 'string'
    || typeof effectiveEnabled !== 'boolean'
    || typeof effectiveAgentAccess !== 'boolean') return undefined;
  if (!NATIVE.has(name)) return { name };
  if (!effectiveEnabled) return { name, restriction: 'application-wide' };
  return effectiveAgentAccess ? { name } : { name, restriction: 'agents' };
}

export function commandRestrictionsFrom(
  data: unknown,
): Record<string, CommandRestriction> | undefined {
  if (!isRecord(data) || !Array.isArray(data.commands)) return undefined;
  const restrictions: Record<string, CommandRestriction> = {};
  for (const row of data.commands) {
    const read = readRow(row);
    if (read === undefined) return undefined;
    if (read.restriction !== undefined) restrictions[read.name] = read.restriction;
  }
  return restrictions;
}
