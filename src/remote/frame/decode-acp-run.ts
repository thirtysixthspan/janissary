import type { AcpRunSnapshot, AcpRunSnapshotRow } from '../../acp/types.js';
import { isRecord } from '../../value-guards.js';
import { nonEmptyString } from './decode-shared.js';

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
