// Per-tab command queue: an agent's queued-but-not-yet-run commands (`queue <agent> <cmd>`),
// keyed by tab label. Pure operations on the queue Map itself; persistence and change
// notification stay the caller's responsibility (TabManager).

export function getQueue(queue: Map<string, string[]>, label: string): string[] {
  return queue.get(label) ?? [];
}

export function pushQueue(queue: Map<string, string[]>, label: string, text: string): void {
  queue.set(label, [...getQueue(queue, label), text]);
}

export function shiftQueue(queue: Map<string, string[]>, label: string): string | undefined {
  const q = getQueue(queue, label);
  if (q.length === 0) return undefined;
  const [front, ...rest] = q;
  queue.set(label, rest);
  return front;
}

export function updateQueueEntry(queue: Map<string, string[]>, label: string, index: number, text: string): boolean {
  const q = getQueue(queue, label);
  if (index < 0 || index >= q.length) return false;
  const next = [...q];
  next[index] = text;
  queue.set(label, next);
  return true;
}

export function removeQueueEntry(queue: Map<string, string[]>, label: string, index: number): boolean {
  const q = getQueue(queue, label);
  if (index < 0 || index >= q.length) return false;
  queue.set(label, q.filter((_, i) => i !== index));
  return true;
}
