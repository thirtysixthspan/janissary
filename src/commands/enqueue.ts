import type { Command } from './types.js';

/** Parse an `enqueue <agent> <command...>` command (the leading `enqueue` is optional). */
export function parseEnqueueCommand(input: string): { label: string; text: string } | { error: string } {
  const body = input.trim().replace(/^enqueue\b\s*/i, '');
  const parts = body.split(/\s+/).filter(Boolean);
  const label = parts[0];
  const text = parts.slice(1).join(' ');
  if (!label || !text) return { error: 'Usage: enqueue <agent> <command>' };
  return { label, text };
}

export const command: Command = {
  name: 'enqueue',
  match: (command_) => /^enqueue\b/i.test(command_),
  run: (command_, tab, managers) => {
    const append = (text: string) => managers.tab.append(tab.label, { input: command_, output: text });
    const parsed = parseEnqueueCommand(command_);
    if ('error' in parsed) { append(parsed.error); return; }
    // The target may be addressed by its label or by its display alias (see `rename`).
    const key = parsed.label.toLowerCase();
    const target = managers.tab.tabs.find((t) => t.label.toLowerCase() === key || t.title?.toLowerCase() === key);
    if (!target) { append(`No tab named "${parsed.label}".`); return; }
    if (target.view !== undefined && target.view !== 'agent') {
      append(`Tab "${parsed.label}" has no command queue.`);
      return;
    }
    managers.tab.enqueue(target.label, parsed.text);
    managers.command.drainQueue(target.label);
    append(`→ ${parsed.label} (queued): ${parsed.text}`);
  },
};
