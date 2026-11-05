import { randomUUID } from 'node:crypto';
import { isAcpActivityKind, type AcpActivityKind } from '../acp/activity.js';
import { messageBus } from '../bus.js';
import { errorFirstLine } from '../error-text.js';
import { appendActivity, ACP_RECORD_SCHEMA_VERSION, isExpired, recordRows, recordTitle, recordWindow, unansweredBlock, validateWindowCount, ACP_RECORD_WINDOW_SIZE } from './model.js';
import { AcpRecordStore } from './store.js';
import type { AcpRecord, AcpRecordOutcome, AcpRecordSource } from './types.js';
import { isRecordId, isRecordOutcome, isRecordSource } from './validation.js';

type ManagerOptions = {
  projectDir?: string;
  store?: AcpRecordStore;
  now?: () => number;
  reportStorageError?: (id: string, detail: string) => void;
};

export class AcpSessionRecords {
  private readonly records = new Map<string, AcpRecord>();
  private readonly dirty = new Set<string>();
  private readonly store: AcpRecordStore;
  private readonly now: () => number;
  private disposed = false;

  constructor(private readonly options: ManagerOptions = {}) {
    this.store = options.store ?? new AcpRecordStore({ projectDir: options.projectDir });
    this.now = options.now ?? Date.now;
    const startupTime = this.timestamp();
    let stored: AcpRecord[];
    try {
      stored = this.store.scan((id, error) => { this.report(id, 'read', error); });
    } catch (error) {
      this.report('scan', 'scan', error);
      stored = [];
    }
    for (const record of stored) {
      this.records.set(record.id, record);
      if (record.outcome === undefined) {
        record.outcome = record.source.kind === 'agent' ? 'Terminated' : 'Closed';
        record.endedAt = Math.max(startupTime, record.updatedAt);
        record.updatedAt = record.endedAt;
        this.save(record);
        this.changed();
      }
      if (isExpired(record, startupTime)) this.delete(record.id);
    }
  }

  begin(source: AcpRecordSource): string {
    if (this.disposed) throw new Error('ACP session records are disposed.');
    if (!isRecordSource(source)) throw new Error('Invalid ACP record source.');
    const timestamp = this.timestamp();
    const record: AcpRecord = {
      schemaVersion: ACP_RECORD_SCHEMA_VERSION, id: randomUUID(), source: { ...source },
      title: recordTitle(source), startedAt: timestamp, updatedAt: timestamp, blocks: [],
    };
    this.records.set(record.id, record);
    this.save(record);
    this.changed();
    return record.id;
  }

  prompt(id: string, text: string): boolean {
    const record = this.open(id);
    if (!record || typeof text !== 'string' || !text.trim() || unansweredBlock(record)) return false;
    if (record.blocks.length === 0) record.title = recordTitle(record.source, text);
    const timestamp = this.touch(record);
    record.blocks.push({ prompt: text, startedAt: timestamp, entries: [] });
    this.save(record);
    this.changed();
    return true;
  }

  activity(id: string, kind: AcpActivityKind, text: string): boolean {
    const record = this.open(id);
    const block = record && unansweredBlock(record);
    if (!record || !block || !isAcpActivityKind(kind) || typeof text !== 'string' || !text) return false;
    appendActivity(block, { kind, text, timestamp: this.touch(record) });
    this.changed();
    return true;
  }

  answer(id: string, text: string): boolean {
    const record = this.open(id);
    const block = record && unansweredBlock(record);
    if (!record || !block || typeof text !== 'string') return false;
    block.answer = text;
    block.endedAt = this.touch(record);
    this.save(record);
    this.changed();
    return true;
  }

  close(id: string, outcome: AcpRecordOutcome): boolean {
    const record = this.open(id);
    if (!record || !isRecordOutcome(record.source, outcome)) return false;
    record.outcome = outcome;
    record.endedAt = this.touch(record);
    this.save(record);
    this.changed();
    return true;
  }

  delete(id: string): boolean {
    const record = this.get(id);
    if (this.disposed || record?.outcome === undefined) return false;
    try {
      this.store.delete(id);
    } catch (error) {
      this.report(id, 'delete', error);
      return false;
    }
    this.records.delete(id);
    this.dirty.delete(id);
    this.changed();
    return true;
  }

  rows() { return recordRows(this.records.values()); }

  window(id: string, count = ACP_RECORD_WINDOW_SIZE) {
    validateWindowCount(count);
    const record = this.get(id);
    return record && recordWindow(record, count);
  }

  dispose(): void {
    if (this.disposed) return;
    for (const record of this.records.values()) {
      if (record.outcome === undefined) this.close(record.id, 'Closed');
      else if (this.dirty.has(record.id)) this.save(record);
    }
    this.disposed = true;
  }

  private get(id: string): AcpRecord | undefined {
    return isRecordId(id) ? this.records.get(id) : undefined;
  }

  private open(id: string): AcpRecord | undefined {
    const record = this.get(id);
    return !this.disposed && record?.outcome === undefined ? record : undefined;
  }

  private timestamp(): number {
    const now = this.now();
    return Number.isFinite(now) ? Math.max(0, now) : 0;
  }

  private touch(record: AcpRecord): number {
    record.updatedAt = Math.max(record.updatedAt, this.timestamp());
    return record.updatedAt;
  }

  private save(record: AcpRecord): void {
    try {
      this.store.write(record);
      this.dirty.delete(record.id);
    } catch (error) {
      this.dirty.add(record.id);
      this.report(record.id, 'write', error);
    }
  }

  private report(id: string, operation: string, error: unknown): void {
    const detail = `${operation} failed: ${errorFirstLine(error)}`;
    try {
      if (this.options.reportStorageError) this.options.reportStorageError(id, detail);
      else process.stderr.write(`warning: ACP record "${id}" ${detail}\n`);
    } catch {
      return;
    }
  }

  private changed(): void {
    messageBus.emit('connections', { type: 'changed' });
  }
}
