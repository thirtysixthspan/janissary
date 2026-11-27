import { killShellGroup, spawnShell } from '../shell/index.js';
import type { ProjectTokens } from '../project/tokens.js';
import type { ServerFrame } from './protocol-frames.js';

export type PipeProcess = { kill: () => void; writer: (data: string) => void };

export type PipeContext = {
  workspaceDir: string;
  tokens: ProjectTokens;
  name: string;
  send: (frame: ServerFrame) => void;
  finish: (exitCode: number) => void;
};

// Spawned in a process group of its own, because the hangup that parks this peer is delivered to
// the ssh session's group and would otherwise take the shell down with the transport — the one
// thing a detach exists to leave running. A `pty` process needs no such care: its pseudo-terminal
// already put it in a session of its own.
export function spawnPipeProcess(id: string, context: PipeContext): PipeProcess {
  const shell = spawnShell(0, { JANUS_AGENT_NAME: context.name }, {
    workspaceDir: context.workspaceDir,
    tokens: context.tokens,
  }, { detached: true });
  const onChunk = (chunk: string) => context.send({ type: 'output', id, data: chunk });
  shell.stdout?.on('data', onChunk);
  shell.stderr?.on('data', onChunk);
  // A shell that cannot start raises `'error'` instead of throwing, and Node may or may not follow
  // it with `'exit'`. Whichever arrives first ends the entry; the other must not send a second exit.
  let ended = false;
  const end = (exitCode: number) => {
    if (ended) return;
    ended = true;
    context.finish(exitCode);
  };
  shell.on('exit', (code) => end(code ?? 0));
  shell.on('error', () => end(1));
  // The shell inherits this server's own directory, so put it in the workspace the same way the
  // local `ShellManager` does for a freshly spawned shell.
  shell.stdin?.write(`cd "${context.workspaceDir}"\n`);
  return {
    kill: () => { killShellGroup(shell); },
    writer: (data) => { if (shell.stdin?.writable) shell.stdin.write(data); },
  };
}
