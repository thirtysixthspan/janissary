// Per-tab command queue operations with change notification, wrapping the pure Map operations
// in queue.ts. Split out of TabManager so its queue-mutation branching lives in one small,
// easily-tested module rather than inline in the manager class.

import { getQueue, pushQueue, shiftQueue, updateQueueEntry, removeQueueEntry } from './queue.js';
import type { QueueEntry } from '../command-queue/entry.js';

export function queueFor(queue: QueueEntry[]): string[] {
  return getQueue(queue);
}

export function enqueue(
  queue: QueueEntry[], text: string, onChange: () => void,
): void {
  pushQueue(queue, text);
  onChange();
}

export function dequeue(
  queue: QueueEntry[], onChange: () => void,
): string | undefined {
  const front = shiftQueue(queue);
  if (front !== undefined) onChange();
  return front;
}

export function editQueued(
  queue: QueueEntry[], index: number, text: string, onChange: () => void,
): void {
  if (updateQueueEntry(queue, index, text)) onChange();
}

export function deleteQueued(
  queue: QueueEntry[], index: number, onChange: () => void,
): void {
  if (removeQueueEntry(queue, index)) onChange();
}
