// Per-tab command queue: an opted-in tab's pending commands.
// Persistence and change notification stay the caller's responsibility (TabManager).

import { ordinaryQueueEntry, queueEntryLine, type QueueEntry } from '../command-queue/entry.js';

export function getQueue(queue: QueueEntry[]): string[] {
  return queue.map((entry) => queueEntryLine(entry));
}

export function pushQueue(queue: QueueEntry[], text: string): void {
  queue.push(text);
}

export function shiftQueue(queue: QueueEntry[]): string | undefined {
  const entry = queue.shift();
  return entry === undefined ? undefined : ordinaryQueueEntry(entry);
}

export function updateQueueEntry(queue: QueueEntry[], index: number, text: string): boolean {
  if (index < 0 || index >= queue.length) return false;
  queue[index] = text;
  return true;
}

export function removeQueueEntry(queue: QueueEntry[], index: number): boolean {
  if (index < 0 || index >= queue.length) return false;
  queue.splice(index, 1);
  return true;
}
