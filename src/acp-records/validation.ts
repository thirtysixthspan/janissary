import { isAcpActivityKind } from '../acp/activity.js';
import { isRecord } from '../value-guards.js';
import { ACP_RECORD_SCHEMA_VERSION } from './model.js';
import type { AcpRecord, AcpRecordBlock, AcpRecordEntry, AcpRecordOutcome, AcpRecordSource } from './types.js';

export function isRecordId(value: unknown): value is string {
  return typeof value === 'string'
    && /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isRecordSource(value: unknown): value is AcpRecordSource {
  if (!isRecord(value) || !nonempty(value.model)
    || !nonempty(value.ownerLabel) || !nonempty(value.ownerName)
    || (value.host !== undefined && !nonempty(value.host))) return false;
  return value.kind === 'acp'
    || (value.kind === 'agent' && nonempty(value.runId) && nonempty(value.taskPath));
}

export function isRecordOutcome(source: AcpRecordSource, value: unknown): value is AcpRecordOutcome {
  return value === 'Closed'
    || (source.kind === 'agent' && typeof value === 'string'
      && ['Completed', 'Failed', 'Terminated'].includes(value));
}

function timestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function inRange(value: unknown, start: number, end: number): value is number {
  return timestamp(value) && value >= start && value <= end;
}

function isEntry(value: unknown): value is AcpRecordEntry {
  return isRecord(value) && isAcpActivityKind(value.kind)
    && typeof value.text === 'string' && value.text.length > 0 && timestamp(value.timestamp);
}

function isBlock(value: unknown): value is AcpRecordBlock {
  if (!isRecord(value) || !nonempty(value.prompt) || !timestamp(value.startedAt)
    || !Array.isArray(value.entries) || value.entries.some((entry: unknown) => !isEntry(entry))) return false;
  if (value.answer === undefined) return value.endedAt === undefined;
  return typeof value.answer === 'string' && timestamp(value.endedAt) && value.endedAt >= value.startedAt;
}

function validHistory(record: AcpRecord): boolean {
  let previous = record.startedAt;
  const end = record.endedAt ?? record.updatedAt;
  for (const [index, block] of record.blocks.entries()) {
    if (!inRange(block.startedAt, previous, end)) return false;
    if (block.answer === undefined && index !== record.blocks.length - 1) return false;
    const blockEnd = block.endedAt ?? end;
    if (!inRange(blockEnd, block.startedAt, end)) return false;
    previous = block.startedAt;
    for (const entry of block.entries) {
      if (!inRange(entry.timestamp, previous, blockEnd)) return false;
      previous = entry.timestamp;
    }
    previous = blockEnd;
  }
  return true;
}

export function isAcpRecord(value: unknown, id: string): value is AcpRecord {
  if (!isRecord(value) || value.schemaVersion !== ACP_RECORD_SCHEMA_VERSION
    || !isRecordId(value.id) || value.id !== id || !isRecordSource(value.source)
    || !nonempty(value.title) || !timestamp(value.startedAt)
    || !timestamp(value.updatedAt) || value.updatedAt < value.startedAt
    || !Array.isArray(value.blocks) || value.blocks.some((block: unknown) => !isBlock(block))) return false;
  if (value.outcome === undefined) {
    if (value.endedAt !== undefined) return false;
  } else if (!isRecordOutcome(value.source, value.outcome)
    || !inRange(value.endedAt, value.startedAt, value.updatedAt)) return false;
  const record: AcpRecord = {
    schemaVersion: value.schemaVersion, id: value.id, source: value.source, title: value.title,
    startedAt: value.startedAt, updatedAt: value.updatedAt, blocks: value.blocks.filter(isBlock),
    ...(timestamp(value.endedAt) && { endedAt: value.endedAt }),
  };
  return validHistory(record);
}
