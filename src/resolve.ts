import { getOutput } from './commands.js';
import { commands } from './commands/index.js';
import type { Resolution } from './types.js';

/**
 * Classify a prompt input into the action it represents, mirroring the dispatch order
 * used when a command is typed into a tab. Pure: callers decide the side effects (a
 * foreground tab can run interactive/app commands; a remote agent refuses them).
 *
 * - `shell`: run in a shell. Explicitly requested via a leading `shell ` keyword — there
 *   is no bare auto-run, so a non-built-in typed without the keyword is unknown.
 * - `app`: an application built-in that needs live state.
 * - `output`: a built-in with textual output to display (also the "unknown command" reply).
 * - `empty`: nothing to do.
 */
export function resolveCommand(raw: string): Resolution {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'empty' };

  // Shell commands are launched with the `shell` keyword, which is stripped before the
  // command reaches the shell.
  if (/^shell\b/i.test(trimmed)) {
    return { kind: 'shell', cmd: trimmed.replace(/^shell\b\s*/i, '') };
  }

  const command = trimmed.replace(/^\//, '');

  for (const c of commands) {
    if (c.match(command)) {
      return { kind: 'app', name: c.name, cmd: command };
    }
  }

  const output = getOutput(command);
  if (output !== null) {
    // `getOutput` returns the "Unknown command: ..." message for anything unrecognized; surface
    // that as `unknown` so the interactive dispatcher can run command recognition on it.
    const kind = output.startsWith('Unknown command:') ? 'unknown' : 'output';
    return { kind, cmd: command, output };
  }

  // Shell commands require the `shell` keyword (handled above); a bare non-built-in is
  // reported as unknown rather than auto-run in the shell.
  return { kind: 'empty' };
}
