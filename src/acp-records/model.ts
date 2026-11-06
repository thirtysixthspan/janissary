import path from 'node:path';
import type { AcpRecord, AcpRecordBlock, AcpRecordEntry, AcpRecordRow, AcpRecordSource, AcpRecordWindow } from './types.js';

export const ACP_RECORD_SCHEMA_VERSION = 1;
export const ACP_RECORD_TITLE_CAP = 60;
export const ACP_RECORD_WINDOW_SIZE = 20;
export const ACP_RECORD_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export function recordTitle(source: AcpRecordSource, prompt?: string): string {
  if (source.kind === 'agent') return `Agent: ${path.basename(source.taskPath)}`;
  const line = prompt?.split('\n', 1)[0].trim();
  return line ? `ACP: ${line}`.slice(0, ACP_RECORD_TITLE_CAP) : 'ACP';
}

export function unansweredBlock(record: AcpRecord): AcpRecordBlock | undefined {
  const block = record.blocks.at(-1);
  return block?.answer === undefined ? block : undefined;
}

export function recordStatus(record: AcpRecord): AcpRecordRow['status'] {
  if (record.outcome !== undefined) return record.outcome;
  return record.source.kind === 'agent' || unansweredBlock(record) ? 'Running' : 'Idle';
}

export function isExpired(record: AcpRecord, now: number): boolean {
  return record.endedAt !== undefined && now - record.endedAt > ACP_RECORD_RETENTION_MS;
}

export function appendActivity(block: AcpRecordBlock, entry: AcpRecordEntry): void {
  const previous = block.entries.at(-1);
  if (previous?.kind === entry.kind && (entry.kind === 'message' || entry.kind === 'thought')) {
    previous.text += entry.text;
  } else {
    block.entries.push(entry);
  }
}

export function recordRow(record: AcpRecord): AcpRecordRow {
  const { id, title, startedAt, updatedAt, endedAt, source } = record;
  return {
    id, title, startedAt, updatedAt,
    kind: source.kind,
    model: source.model,
    ownerLabel: source.ownerLabel,
    ownerName: source.ownerName,
    ...(source.host !== undefined && { host: source.host }),
    ...(source.kind === 'acp' && source.role !== undefined && { role: source.role }),
    ...(source.kind === 'agent' && { runId: source.runId }),
    ...(endedAt !== undefined && { endedAt }),
    status: recordStatus(record),
  };
}

export function recordRows(records: Iterable<AcpRecord>): AcpRecordRow[] {
  return [...records].map((record) => recordRow(record)).toSorted((a, b) =>
    b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
}

export function validateWindowCount(count: number): void {
  if (!Number.isSafeInteger(count) || count <= 0) throw new Error('Invalid ACP record window count.');
}

export function recordWindow(record: AcpRecord, count = ACP_RECORD_WINDOW_SIZE): AcpRecordWindow {
  validateWindowCount(count);
  const offset = Math.max(0, record.blocks.length - count);
  return {
    ...recordRow(record),
    source: { ...record.source },
    blocks: record.blocks.slice(offset).map((block) => ({
      ...block, entries: block.entries.map((entry) => ({ ...entry })),
    })),
    totalBlocks: record.blocks.length,
    offset,
    hasOlder: offset > 0,
  };
}

export function durableRecord(record: AcpRecord): AcpRecord {
  return {
    ...record,
    blocks: record.outcome === undefined
      ? record.blocks.filter((block) => block.answer !== undefined)
      : record.blocks,
  };
}
