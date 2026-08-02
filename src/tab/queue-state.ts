import {
  queueFor as queueForOp, enqueue as enqueueOp, dequeue as dequeueOp, editQueued as editQueuedOp, deleteQueued as deleteQueuedOp,
} from './queue-commands.js';
import type { Tab } from './types.js';
import { runtimeFor } from './runtime.js';

export abstract class TabQueueState {
  protected abstract tabs: Tab[];

  protected abstract persistQueue(label: string): void;

  queueFor(label: string): string[] {
    const queue = runtimeFor(this.tabs, label)?.queue;
    return queue ? queueForOp(queue) : [];
  }

  enqueue(label: string, text: string): void {
    const queue = runtimeFor(this.tabs, label);
    if (queue) enqueueOp(queue.queue, text, () => this.persistQueue(label));
  }

  dequeue(label: string): string | undefined {
    const queue = runtimeFor(this.tabs, label);
    return queue ? dequeueOp(queue.queue, () => this.persistQueue(label)) : undefined;
  }

  editQueued(label: string, index: number, text: string): void {
    const queue = runtimeFor(this.tabs, label);
    if (queue) editQueuedOp(queue.queue, index, text, () => this.persistQueue(label));
  }

  deleteQueued(label: string, index: number): void {
    const queue = runtimeFor(this.tabs, label);
    if (queue) deleteQueuedOp(queue.queue, index, () => this.persistQueue(label));
  }
}
