import type { Command } from './types.js';
import type { Tab } from '../types.js';
import type { CommandManagers } from './types.js';
import { resolveTarget } from './resolve-target.js';

/** Parse a `send <label> <text...>` command (the leading `send` is optional). */
export function parseSendCommand(input: string): { label: string; text: string } | { error: string } {
  const body = input.trim().replace(/^send\b\s*/i, '');
  const parts = body.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { error: 'Usage: send <label> <text>' };
  const label = parts[0];
  const text = parts.slice(1).join(' ');
  if (!text) return { error: 'No text to send.' };
  return { label, text };
}

function deliverTo(target: Tab, text: string, managers: CommandManagers): string | null {
  if (target.view === 'harness') {
    if (target.harness?.status !== 'running') return `Tab "${target.label}" is not a running harness.`;
    // Split from the text so a long line's trailing \r can't land in the same burst the harness's
    // own input parser treats as a paste (see schedule-manager.ts's `fire`).
    const ptyId = target.harness.ptyId;
    managers.pty.input(ptyId, text);
    setTimeout(() => managers.pty.input(ptyId, '\r'), 50);
    return null;
  }
  if (target.view === undefined || target.view === 'agent') {
    managers.command.dispatchTo(target.label, text);
    return null;
  }
  return `Tab "${target.label}" does not accept input.`;
}

export const command: Command = {
  name: 'send',
  match: (command_) => /^send\b/i.test(command_),
  run: (command_, tab, managers) => {
    const append = (text: string) => managers.tab.append(tab.label, { input: command_, output: text });
    const parsed = parseSendCommand(command_);
    if ('error' in parsed) { append(parsed.error); return; }
    const target = resolveTarget(parsed.label, managers, append);
    if (!target) return;
    const error = deliverTo(target, parsed.text, managers);
    if (error) { append(error); return; }
    append(`→ ${parsed.label}: ${parsed.text}`);
  },
};
