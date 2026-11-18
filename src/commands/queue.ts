import type { Command } from './types.js';
import { resolveTarget } from './resolve-target.js';
import { supportsCommandQueue } from '../command-queue/support.js';
import { appendCommandOutput } from '../command/append.js';
import { readWords } from './parse-tab.js';

/** Parse a `queue <shell-tab> <command...>` command (the leading `queue` is optional). */
export function parseQueueCommand(input: string): { label: string; text: string } | { error: string } {
  const body = input.trim().replace(/^queue\b\s*/i, '');
  const first = readWords(body).tokens[0];
  const text = first ? body.slice(first.end).trim().replaceAll(/\s+/g, ' ') : '';
  if (!first || !text) return { error: 'Usage: queue <shell-tab> <command>' };
  return { label: first.value, text };
}

export const command: Command = {
  name: 'queue',
  match: (command_) => /^queue\b/i.test(command_),
  samples: ['queue', 'queue list'],
  run: (command_, tab, managers, invocation) => {
    // Bare `queue` is the interactive picker (Ctrl+E), handled client-side; reaching the server
    // non-interactively (e.g. via a scheduled dispatch) is a no-op.
    if (/^queue\s*$/i.test(command_.trim())) return;

    const append = (text: string) => appendCommandOutput(managers, tab.label, { input: command_, output: text }, invocation);
    const parsed = parseQueueCommand(command_);
    if ('error' in parsed) { append(parsed.error); return; }
    const target = resolveTarget(parsed.label, managers, append);
    if (!target) return;
    if (!supportsCommandQueue(target, managers.plugins.declarations)) {
      append(`Tab "${parsed.label}" has no command queue.`);
      return;
    }
    managers.tab.enqueue(target.label, parsed.text);
    append(`→ ${parsed.label} (queued): ${parsed.text}`);
  },
};
