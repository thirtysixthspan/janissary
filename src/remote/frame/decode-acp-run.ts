import type { AcpRunSnapshot, AcpRunSnapshotRow } from '../../acp/types.js';
import { isRecord } from '../../value-guards.js';
import { malformed, nonEmptyString, nonNegativeInteger, type DecodeResult } from './decode-shared.js';

export function decodeAcpRun(record: Record<string, unknown>): DecodeResult {
  const snapshot = decodeAcpRunSnapshot(record.snapshot);
  if (!nonEmptyString(record.id) || typeof record.text !== 'string' || !snapshot) return malformed('acp-run');
  return { type: 'acp-run', id: record.id, text: Buffer.from(record.text, 'base64').toString('utf8'), snapshot };
}

export function decodeAcpToolResult(record: Record<string, unknown>): DecodeResult {
  const { id, request, output, error } = record;
  if (!nonEmptyString(id) || !nonNegativeInteger(request)) return malformed('acp-tool-result');
  if ((output === undefined) === (error === undefined)) return malformed('acp-tool-result');
  if (output !== undefined) {
    return typeof output === 'string'
      ? { type: 'acp-tool-result', id, request, output: Buffer.from(output, 'base64').toString('utf8') }
      : malformed('acp-tool-result');
  }
  return nonEmptyString(error)
    ? { type: 'acp-tool-result', id, request, error }
    : malformed('acp-tool-result');
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function decodeRows(value: unknown): AcpRunSnapshotRow[] | undefined {
  if (!Array.isArray(value)) return;
  const rows: AcpRunSnapshotRow[] = [];
  for (const row of value) {
    if (!isRecord(row) || typeof row.name !== 'string'
      || typeof row.effectiveEnabled !== 'boolean' || typeof row.effectiveAgentAccess !== 'boolean') return;
    rows.push({ name: row.name, effectiveEnabled: row.effectiveEnabled, effectiveAgentAccess: row.effectiveAgentAccess });
  }
  return rows;
}

export function decodeAcpRunSnapshot(value: unknown): AcpRunSnapshot | undefined {
  if (!isRecord(value) || !isStringArray(value.grants)) return;
  const grants = [...value.grants];
  if (value.kind === 'agent') {
    if (typeof value.askUser !== 'boolean') return;
    return { kind: 'agent', grants, askUser: value.askUser };
  }
  if (value.kind !== 'core' || (value.role !== 'ask' && value.role !== 'tell')
    || !nonEmptyString(value.roleName) || typeof value.withoutTools !== 'boolean') return;
  const rows = decodeRows(value.rows);
  if (!rows) return;
  return { kind: 'core', role: value.role, roleName: value.roleName, grants, rows, withoutTools: value.withoutTools };
}
