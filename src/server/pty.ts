import * as pty from 'node-pty';

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
 * Ink takeover, output is delivered to a callback (the server forwards it to the client's xterm)
 * rather than written to the real stdout, so many can run concurrently across tabs.
 */
export function spawnPty(
  program: string,
  cmd: string,
  cwd: string,
  handlers: PtyHandlers,
  cols = 80,
  rows = 24,
): PtySession {
  const id = `pty${++counter}`;
  const shell = process.env.SHELL || 'bash';
  const proc = pty.spawn(shell, ['-lc', cmd], {
    name: 'xterm-256color',
    cols: Math.max(1, cols),
    rows: Math.max(1, rows),
    cwd: cwd || process.cwd(),
    env: process.env as Record<string, string>,
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
