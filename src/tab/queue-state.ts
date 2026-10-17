import {
  queueFor as queueForOp, enqueue as enqueueOp, dequeue as dequeueOp, editQueued as editQueuedOp, deleteQueued as deleteQueuedOp,
} from './queue-commands.js';
import type { Tab } from './types.js';
import { runtimeFor } from './runtime.js';
import type { QueueEntry } from '../command-queue/entry.js';
import { enqueueSystemSchedule, dequeueWithReceipt, consumeReceipt, discardReceipt } from '../command-queue/receipts.js';
import { pushQueue } from './queue.js';
import type { DequeuedCommand, QueueReceipt } from '../command-queue/receipts.js';
import { TabPluginRejection } from '../plugins/api-capabilities.js';

export abstract class TabQueueState {
  protected abstract tabs: Tab[];

  protected abstract queueChanged(): void;

  queueFor(label: string): string[] {
    const queue = runtimeFor(this.tabs, label)?.queue;
    return queue ? queueForOp(queue) : [];
  }

  enqueueSystemSchedule(label: string, line: string, scheduleKey: string): void {
    const runtime = runtimeFor(this.tabs, label);
    if (!runtime) return;
    enqueueSystemSchedule(runtime.queue, line, scheduleKey);
    this.queueChanged();
  }

  enqueueSystemScheduleBatch(label: string, lines: string[], scheduleKey: string): void {
    const runtime = runtimeFor(this.tabs, label);
    if (!runtime || lines.length === 0) return;
    for (const line of lines) enqueueSystemSchedule(runtime.queue, line, scheduleKey);
    this.queueChanged();
  }

  enqueueSystemBatch(label: string, lines: string[]): void {
    const runtime = runtimeFor(this.tabs, label);
    if (!runtime || lines.length === 0) return;
    for (const line of lines) pushQueue(runtime.queue, line);
    this.queueChanged();
  }

  dequeueCommand(label: string, pluginId: string): DequeuedCommand | null {
    const runtime = runtimeFor(this.tabs, label);
    if (!runtime) return null;
    const command = dequeueWithReceipt(runtime, pluginId);
    if (command) this.queueChanged();
    return command;
  }

  consumeCommandReceipt(label: string, pluginId: string, receipt: QueueReceipt): QueueEntry {
    const runtime = runtimeFor(this.tabs, label);
    if (!runtime) throw new TabPluginRejection('command queue tab is no longer open');
    return consumeReceipt(runtime, pluginId, receipt);
  }

  discardCommandReceipt(label: string, pluginId: string, receipt: QueueReceipt): void {
    const runtime = runtimeFor(this.tabs, label);
    if (runtime) discardReceipt(runtime, pluginId, receipt);
  }

  enqueue(label: string, text: string): void {
    const queue = runtimeFor(this.tabs, label);
    if (queue) enqueueOp(queue.queue, text, () => this.queueChanged());
  }

  dequeue(label: string): string | undefined {
    const queue = runtimeFor(this.tabs, label);
    return queue ? dequeueOp(queue.queue, () => this.queueChanged()) : undefined;
  }

  editQueued(label: string, index: number, text: string): void {
    const queue = runtimeFor(this.tabs, label);
    if (queue) editQueuedOp(queue.queue, index, text, () => this.queueChanged());
  }

  deleteQueued(label: string, index: number): void {
    const queue = runtimeFor(this.tabs, label);
    if (queue) deleteQueuedOp(queue.queue, index, () => this.queueChanged());
  }
}
