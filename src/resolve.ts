import { getOutput } from './commands.js';
import { commands } from './commands/index.js';

// A built-in command's name. Mirrors `Command['name']` (a string) without importing from
// `commands/types.ts`, which would create a `resolve.ts` ↔ `commands/types.ts` import cycle.
export type AppCommand = string;

export type Resolution =
  | { kind: 'empty' }
  | { kind: 'shell'; cmd: string }
  | { kind: 'app'; name: AppCommand; cmd: string }
  | { kind: 'output'; cmd: string; output: string }
  // An unprefixed command that matches no built-in, with the existing unknown-command reply.
  | { kind: 'unknown'; cmd: string; output: string };

/**
 * Classify a prompt input into the action it represents, mirroring the dispatch order
 * used when a command is typed into a tab. Pure: callers decide the side effects (a
 * foreground tab can run interactive/app commands; a remote agent refuses them).
 *
 * - `shell`: run in a shell. Explicitly requested with a leading `!`; there is no bare
 *   auto-run, so a non-built-in typed without it is unknown.
 * - `app`: an application built-in that needs live state.
 * - `output`: a built-in with textual output to display (also the "unknown command" reply).
 * - `empty`: nothing to do.
 */
export function resolveCommand(raw: string, available: (name: string) => boolean = () => true): Resolution {
  const trimmed = raw.trim();
  if (!trimmed) return { kind: 'empty' };

  // A leading `!` runs the rest of the line in the shell.
  if (trimmed.startsWith('!')) {
    return { kind: 'shell', cmd: trimmed.slice(1).replace(/^\s+/, '') };
  }

  const command = trimmed.replace(/^\//, '');

  for (const c of commands) {
    if (c.match(command) && available(c.name)) {
      return { kind: 'app', name: c.name, cmd: command };
    }
  }

  // `getOutput` distinguishes help, empty input, and the unknown-command reply.
  const result = getOutput(command);
  // Shell commands require a leading `!`; a bare non-built-in is reported as unknown
  // rather than auto-run in the shell.
  if (result.kind === 'silent') return { kind: 'empty' };
  return { kind: result.kind, cmd: command, output: result.text };
}
