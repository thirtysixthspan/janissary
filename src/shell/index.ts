import { spawn, type ChildProcess } from 'node:child_process';
import { sandboxSpawn, type SandboxOptions } from '../sandbox/index.js';
import { shellStartupArgs } from './startup.js';
import { shellCommandInput, shellPwdQueryInput } from './command-input.js';

// The subset of `ChildProcess` that shell execution actually touches: `stdin`'s writability and
// `write`, `stdout`/`stderr` as `'data'` emitters, and `kill()`. Narrow enough that a process
// running on another machine can satisfy it (see `src/remote/shell-session.ts`) without pretending
// to be a real local child.
export type ShellProcess = Pick<ChildProcess, 'stdin' | 'stdout' | 'stderr' | 'kill'>;

// `detached` puts the shell in a process group of its own instead of the caller's. Only the remote
// server asks for it: the hangup that parks a peer is delivered to the ssh session's process group,
// which the server and everything it spawned share, and a shell left in that group dies with the
// transport the detach exists to give up. A local shell has no transport to be hung up by.
export type ShellSpawnOptions = { detached?: boolean };

// `sandbox`, when given a `workspaceDir`, confines the shell (and everything it spawns) to that
// workspace (see src/sandbox/index.ts); omitted or workspaceDir-less, the shell runs exactly as before.
export function spawnShell(
  _tabIndex: number,
  extraEnvironment?: Record<string, string>,
  sandbox?: SandboxOptions,
  options?: ShellSpawnOptions,
): ChildProcess {
  const baseEnv = { ...process.env, ...extraEnvironment };
  const shellPath = process.env.SHELL || 'bash';
  const { command, args, env } = sandboxSpawn(sandbox ?? {}, shellPath, shellStartupArgs(shellPath), baseEnv);
  const shell = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
    ...(options?.detached === true && { detached: true }),
  });
  shell.stdout.setEncoding('utf8');
  shell.stderr.setEncoding('utf8');
  // Swallow EPIPE on stdin: the shell may exit while a write is in flight (e.g. during test cleanup).
  shell.stdin.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
  return shell;
}

/**
 * End a shell spawned with `detached` together with everything still running under it. Its own group
 * is the only thing that will ever reach the command it is in the middle of running — nothing else
 * shares a group with it any more — so signalling the shell alone would leave that command behind on
 * the host. Never call this on a shell spawned without `detached`: its group is this process's own.
 */
export function killShellGroup(shell: ChildProcess): void {
  const pid = shell.pid;
  if (pid === undefined) { shell.kill(); return; }
  try { process.kill(-pid, 'SIGTERM'); } catch { shell.kill(); }
}

export function executeShellCmd(
  shell: ShellProcess,
  command: string,
  tabIndex: number,
  onProgress: (outputBuffer: string) => void,
  onComplete: (result: string) => void,
): void {
  const prompt = `__JS_END_${tabIndex}_${Date.now()}__`;
  let outputBuffer = '';

  const done = () => {
    shell.stdout!.removeListener('data', onChunk);
    shell.stderr!.removeListener('data', onChunk);
  };

  const onChunk = (chunk: string) => {
    outputBuffer += chunk;
    const endIndex = outputBuffer.indexOf(prompt);
    if (endIndex === -1) {
      onProgress(outputBuffer);
    } else {
      const result = outputBuffer.slice(0, Math.max(0, endIndex)).trim();
      done();
      onComplete(result);
    }
  };

  shell.stdout!.on('data', onChunk);
  shell.stderr!.on('data', onChunk);
  if (shell.stdin?.writable) shell.stdin.write(shellCommandInput(command, prompt));
}

export function queryShellPwd(
  shell: ShellProcess,
  tabIndex: number,
  onResult: (pwd: string) => void,
): void {
  const prompt = `__PWD_${tabIndex}_${Date.now()}__`;
  let buffer = '';

  const onData = (chunk: string) => {
    buffer += chunk;
    const endIndex = buffer.indexOf(prompt);
    if (endIndex !== -1) {
      shell.stdout!.removeListener('data', onData);
      shell.stderr!.removeListener('data', onData);
      onResult(buffer.slice(0, Math.max(0, endIndex)).trim());
    }
  };

  shell.stdout!.on('data', onData);
  shell.stderr!.on('data', onData);
  if (shell.stdin?.writable) shell.stdin.write(shellPwdQueryInput(prompt));
}
