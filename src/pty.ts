import * as pty from 'node-pty';
import { sandboxSpawn, type SandboxOptions } from './sandbox.js';

// A live pseudo-terminal backing an inline xterm.js card (an interactive program like vim/less
// or an AI harness like claude/codex). Bytes flow out through the manager's `onData`; keystrokes
// come back via `write`.
export type PtySession = {
  id: string;
  program: string;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: () => void;
};

export type PtyHandlers = {
  onData: (id: string, data: string) => void;
  onExit: (id: string, exitCode: number) => void;
};

let counter = 0;

/**
 * Spawn `cmd` in a pseudo-terminal. `program` is the display label for the card. Unlike the old
 * output is delivered to a callback (the server forwards it to the client's xterm)
 * rather than written to the real stdout, so many can run concurrently across tabs.
 * `sandbox`, when given a `workspaceDir`, confines the process to that workspace (see sandbox.ts);
 * omitted or workspaceDir-less, the command runs exactly as before.
 */
export function spawnPty(
  program: string,
  command: string,
  cwd: string,
  handlers: PtyHandlers,
  cols = 80,
  rows = 24,
  sandbox?: SandboxOptions,
): PtySession {
  const id = `pty${++counter}`;
  const shell = process.env.SHELL || 'bash';
  const { command: file, args, env } = sandboxSpawn(sandbox ?? {}, shell, ['-lc', command]);
  const proc = pty.spawn(file, args, {
    name: 'xterm-256color',
    cols: Math.max(1, cols),
    rows: Math.max(1, rows),
    cwd: cwd || process.cwd(),
    env,
  });

  proc.onData((d) => handlers.onData(id, d));
  proc.onExit(({ exitCode }) => handlers.onExit(id, exitCode));

  return {
    id,
    program,
    write: (data) => proc.write(data),
    resize: (c, r) => {
      try { proc.resize(Math.max(1, c), Math.max(1, r)); } catch { /* process may have exited */ }
    },
    kill: () => {
      try { proc.kill(); } catch { /* already gone */ }
    },
  };
}
