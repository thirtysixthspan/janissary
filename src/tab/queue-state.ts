import {
  queueFor as queueForOp, enqueue as enqueueOp, dequeue as dequeueOp, editQueued as editQueuedOp, deleteQueued as deleteQueuedOp,
} from './queue-commands.js';

export abstract class TabQueueState {
  protected readonly queue = new Map<string, string[]>();

  protected abstract persistQueue(label: string): void;

  queueFor(label: string): string[] {
    return queueForOp(this.queue, label);
  }

  enqueue(label: string, text: string): void {
    enqueueOp(this.queue, label, text, (l) => this.persistQueue(l));
  }

  dequeue(label: string): string | undefined {
    return dequeueOp(this.queue, label, (l) => this.persistQueue(l));
  }

  editQueued(label: string, index: number, text: string): void {
    editQueuedOp(this.queue, label, index, text, (l) => this.persistQueue(l));
  }

  deleteQueued(label: string, index: number): void {
    deleteQueuedOp(this.queue, label, index, (l) => this.persistQueue(l));
  }
}
