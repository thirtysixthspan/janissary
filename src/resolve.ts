import { getOutput } from './commands.js';

// App/tab-management built-ins that require live application state to run.
export type AppCommand = 'agent' | 'next' | 'msg' | 'broadcast' | 'acp' | 'db' | 'browser' | 'connection' | 'clear' | 'state' | 'hist' | 'close' | 'quit';

export type Resolution =
  | { kind: 'empty' }
  | { kind: 'shell'; cmd: string }
  | { kind: 'app'; name: AppCommand; cmd: string }
  | { kind: 'output'; cmd: string; output: string };

/**
 * Classify a prompt input into the action it represents, mirroring the dispatch order
 * used when a command is typed into a tab. Pure: callers decide the side effects (a
 * foreground tab can run interactive/app commands; a remote agent refuses them).
 *
 * - `shell`: run in a shell. Explicitly requested via a leading `shell ` keyword — there
 *   is no bare auto-run, so a non-built-in typed without the keyword is unknown.
 * - `app`: an application built-in that needs live state (agent/next/msg/clear/…).
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

  const cmd = trimmed.replace(/^\//, '');
  const lower = cmd.toLowerCase();

  if (/^agent\b/i.test(cmd)) return { kind: 'app', name: 'agent', cmd };
  if (lower === 'next') return { kind: 'app', name: 'next', cmd };
  if (/^msg\b/i.test(cmd)) return { kind: 'app', name: 'msg', cmd };
  if (/^broadcast\b/i.test(cmd)) return { kind: 'app', name: 'broadcast', cmd };
  if (/^acp\b/i.test(cmd)) return { kind: 'app', name: 'acp', cmd };
  if (/^db\b/i.test(cmd)) return { kind: 'app', name: 'db', cmd };
  if (/^browser\b/i.test(cmd)) return { kind: 'app', name: 'browser', cmd };
  if (/^connection\b/i.test(cmd)) return { kind: 'app', name: 'connection', cmd };

  const output = getOutput(cmd);
  if (output === null) {
    if (lower === 'clear') return { kind: 'app', name: 'clear', cmd };
    if (lower === 'state') return { kind: 'app', name: 'state', cmd };
    if (lower === 'hist') return { kind: 'app', name: 'hist', cmd };
    if (lower === 'close') return { kind: 'app', name: 'close', cmd };
    if (lower === 'quit' || lower === 'exit') return { kind: 'app', name: 'quit', cmd };
    return { kind: 'empty' };
  }

  // Shell commands require the `shell` keyword (handled above); a bare non-built-in is
  // reported as unknown rather than auto-run in the shell.
  return { kind: 'output', cmd, output };
}
