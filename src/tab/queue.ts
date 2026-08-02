// Per-tab command queue: an agent's queued-but-not-yet-run commands (`queue <agent> <cmd>`).
// Persistence and change notification stay the caller's responsibility (TabManager).

export function getQueue(queue: string[]): string[] {
  return queue;
}

export function pushQueue(queue: string[], text: string): void {
  queue.push(text);
}

export function shiftQueue(queue: string[]): string | undefined {
  return queue.shift();
}

export function updateQueueEntry(queue: string[], index: number, text: string): boolean {
  if (index < 0 || index >= queue.length) return false;
  queue[index] = text;
  return true;
}

export function removeQueueEntry(queue: string[], index: number): boolean {
  if (index < 0 || index >= queue.length) return false;
  queue.splice(index, 1);
  return true;
}
