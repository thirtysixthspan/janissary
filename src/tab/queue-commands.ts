// Per-tab command queue operations with change notification, wrapping the pure Map operations
// in queue.ts. Split out of TabManager so its queue-mutation branching lives in one small,
// easily-tested module rather than inline in the manager class.

import { getQueue, pushQueue, shiftQueue, updateQueueEntry, removeQueueEntry } from './queue.js';

export function queueFor(queue: string[]): string[] {
  return getQueue(queue);
}

export function enqueue(
  queue: string[], text: string, persistQueue: () => void,
): void {
  pushQueue(queue, text);
  persistQueue();
}

export function dequeue(
  queue: string[], persistQueue: () => void,
): string | undefined {
  const front = shiftQueue(queue);
  if (front !== undefined) persistQueue();
  return front;
}

export function editQueued(
  queue: string[], index: number, text: string, persistQueue: () => void,
): void {
  if (updateQueueEntry(queue, index, text)) persistQueue();
}

export function deleteQueued(
  queue: string[], index: number, persistQueue: () => void,
): void {
  if (removeQueueEntry(queue, index)) persistQueue();
}
