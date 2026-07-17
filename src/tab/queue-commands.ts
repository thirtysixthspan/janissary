// Per-tab command queue operations with change notification, wrapping the pure Map operations
// in queue.ts. Split out of TabManager so its queue-mutation branching lives in one small,
// easily-tested module rather than inline in the manager class.

import { getQueue, pushQueue, shiftQueue, updateQueueEntry, removeQueueEntry } from './queue.js';

export function queueFor(queue: Map<string, string[]>, label: string): string[] {
  return getQueue(queue, label);
}

export function enqueue(
  queue: Map<string, string[]>, label: string, text: string, persistQueue: (label: string) => void,
): void {
  pushQueue(queue, label, text);
  persistQueue(label);
}

export function dequeue(
  queue: Map<string, string[]>, label: string, persistQueue: (label: string) => void,
): string | undefined {
  const front = shiftQueue(queue, label);
  if (front !== undefined) persistQueue(label);
  return front;
}

export function editQueued(
  queue: Map<string, string[]>, label: string, index: number, text: string, persistQueue: (label: string) => void,
): void {
  if (updateQueueEntry(queue, label, index, text)) persistQueue(label);
}

export function deleteQueued(
  queue: Map<string, string[]>, label: string, index: number, persistQueue: (label: string) => void,
): void {
  if (removeQueueEntry(queue, label, index)) persistQueue(label);
}
