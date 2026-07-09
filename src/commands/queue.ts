import type { Command } from './types.js';

/** Parse a `queue <agent> <command...>` command (the leading `queue` is optional). */
export function parseQueueCommand(input: string): { label: string; text: string } | { error: string } {
  const body = input.trim().replace(/^queue\b\s*/i, '');
  const parts = body.split(/\s+/).filter(Boolean);
  const label = parts[0];
  const text = parts.slice(1).join(' ');
  if (!label || !text) return { error: 'Usage: queue <agent> <command>' };
  return { label, text };
}

export const command: Command = {
  name: 'queue',
  match: (command_) => /^queue\b/i.test(command_),
  run: (command_, tab, managers) => {
    // Bare `queue` is the interactive picker (Ctrl+E), handled client-side; reaching the server
    // non-interactively (e.g. via a scheduled dispatch) is a no-op.
    if (/^queue\s*$/i.test(command_.trim())) return;

    const append = (text: string) => managers.tab.append(tab.label, { input: command_, output: text });
    const parsed = parseQueueCommand(command_);
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
