import type { Managers } from '../managers.js';
import type { Message } from './communication-manager.js';

// The per-recipient FIFO queue and its drain loop, split out of AgentCommunicationManager:
// `handle` (message dispatch, which runs commands through `capture.run`) stays the caller's,
// passed through as an opaque callback so this module never itself executes anything.

export function sendMessage(
  managers: Managers, queues: Map<string, Message[]>, message: Omit<Message, 'id'>, nextId: () => number,
  pump: (label: string) => void,
): boolean {
  const to = message.to.toLowerCase();
  const target = managers.tab.tabs.find(
    (t) => t.label.toLowerCase() === to || t.title?.toLowerCase() === to,
  );
  if (!target) return false;
  const full: Message = { ...message, to: target.label, id: nextId() };
  const q = queues.get(target.label) ?? [];
  q.push(full);
  queues.set(target.label, q);
  pump(target.label);
  return true;
}

export function pumpQueue(
  queues: Map<string, Message[]>, processing: Set<string>, label: string,
  handle: (message: Message, done: () => void) => void,
  pump: (label: string) => void,
): void {
  if (processing.has(label)) return;
  const queue = queues.get(label);
  if (!queue || queue.length === 0) return;
  processing.add(label);
  const message = queue.shift()!;
  handle(message, () => {
    processing.delete(label);
    if ((queues.get(label)?.length ?? 0) > 0) setTimeout(() => pump(label), 0);
  });
}
