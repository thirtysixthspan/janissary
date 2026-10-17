import { randomUUID } from 'node:crypto';
import { TabPluginRejection } from '../plugins/api-capabilities.js';
import type { QueueEntry } from './entry.js';
import { queueEntryLine } from './entry.js';
import type { TabRuntime } from '../tab/types.js';

export const MAX_OUTSTANDING_QUEUE_RECEIPTS = 256;

export type QueueReceipt = string;
export type DequeuedCommand = { line: string; receipt: QueueReceipt };
export type ReceiptRecord = {
  pluginId: string;
  incarnation: string;
  entry: QueueEntry;
};

export function enqueueSystemSchedule(
  queue: QueueEntry[], line: string, scheduleKey: string,
): void {
  queue.push({ line, origin: { kind: 'system-schedule', scheduleKey } });
}

export function dequeueWithReceipt(
  runtime: TabRuntime,
  pluginId: string,
): DequeuedCommand | null {
  const receipts = runtime.queueReceipts ??= new Map();
  if (receipts.size >= MAX_OUTSTANDING_QUEUE_RECEIPTS) {
    throw new TabPluginRejection('too many outstanding command queue receipts');
  }
  const entry = runtime.queue.shift();
  if (entry === undefined) return null;
  const incarnation = runtime.incarnation ??= randomUUID();
  const receipt = randomUUID();
  receipts.set(receipt, { pluginId, incarnation, entry });
  return { line: queueEntryLine(entry), receipt };
}

export function consumeReceipt(
  runtime: TabRuntime,
  pluginId: string,
  receipt: QueueReceipt,
): QueueEntry {
  const records = runtime.queueReceipts;
  const record = records?.get(receipt);
  if (!record || record.pluginId !== pluginId || record.incarnation !== runtime.incarnation) {
    throw new TabPluginRejection('invalid or stale command queue receipt');
  }
  if (records) records.delete(receipt);
  return record.entry;
}

export function discardReceipt(runtime: TabRuntime, pluginId: string, receipt: QueueReceipt): void {
  const records = runtime.queueReceipts;
  const record = records?.get(receipt);
  if (!record) return;
  if (record.pluginId !== pluginId || record.incarnation !== runtime.incarnation) {
    throw new TabPluginRejection('invalid or stale command queue receipt');
  }
  if (records) records.delete(receipt);
}

export function releasePluginReceipts(runtime: TabRuntime, pluginId: string): void {
  const receipts = runtime.queueReceipts;
  if (!receipts) return;
  for (const [receipt, record] of receipts) {
    if (record.pluginId === pluginId) runtime.queueReceipts?.delete(receipt);
  }
}
