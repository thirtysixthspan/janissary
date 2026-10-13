import { spawn, type ChildProcess } from 'node:child_process';
import { sandboxSpawn, type SandboxOptions } from '../sandbox/index.js';
import { shellStartupArgs } from './startup.js';
import { shellCommandInput, shellPwdQueryInput } from './command-input.js';
import { BoundedOutputAccumulator, MAX_SHELL_OUTPUT_CHARS, PwdPathAccumulator } from './bounded-output.js';

// The subset of `ChildProcess` that shell execution actually touches: `stdin`'s writability and
// `write`, `stdout`/`stderr` as `'data'` emitters, and `kill()`. Narrow enough that a process
// running on another machine can satisfy it (see `src/remote/shell-session.ts`) without pretending
// to be a real local child.
export type ShellProcess = Pick<ChildProcess, 'stdin' | 'stdout' | 'stderr' | 'kill'>;

// `detached` puts the shell in a process group of its own instead of the caller's. Only the remote
// server asks for it: the hangup that parks a peer is delivered to the ssh session's process group,
// which the server and everything it spawned share, and a shell left in that group dies with the
// transport the detach exists to give up. A local shell has no transport to be hung up by.
export type ShellSpawnOptions = { cwd?: string; detached?: boolean };

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
    ...(options?.cwd !== undefined && { cwd: options.cwd }),
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

// Appended to a command's output when the shell exited before printing the command's sentinel.
export const SHELL_EXITED_NOTE = '(shell exited)';

function withExitNote(output: string): string {
  const trimmed = output.trim();
  return trimmed ? `${trimmed}\n${SHELL_EXITED_NOTE}` : SHELL_EXITED_NOTE;
}

// A shell that can no longer answer: nothing can be written to it, or its output has already ended.
// A stream whose `'end'` has fired never fires it again, so waiting on one would wait forever.
function shellGone(shell: ShellProcess): boolean {
  return !shell.stdin?.writable || shell.stdout?.readableEnded === true;
}

// Runs `command` and completes on its sentinel. If the shell's output ends first — the shell exited
// on its own — it completes with what arrived plus `SHELL_EXITED_NOTE`, so the tab's queue unblocks.
export function executeShellCmd(
  shell: ShellProcess,
  command: string,
  tabIndex: number,
  onProgress: (outputBuffer: string) => void,
  onComplete: (result: string) => void,
): void {
  if (shellGone(shell)) { onComplete(SHELL_EXITED_NOTE); return; }
  const prompt = `__JS_END_${tabIndex}_${Date.now()}__`;
  const output = new BoundedOutputAccumulator(prompt, MAX_SHELL_OUTPUT_CHARS);

  const done = () => {
    shell.stdout!.removeListener('data', onChunk);
    shell.stderr!.removeListener('data', onChunk);
    shell.stdout!.removeListener('end', onEnd);
  };

  const onChunk = (chunk: string) => {
    if (output.append(chunk)) {
      done();
      onComplete(output.result());
      return;
    }
    onProgress(output.progress());
  };

  const onEnd = () => {
    output.flush();
    done();
    onComplete(withExitNote(output.result()));
  };

  shell.stdout!.on('data', onChunk);
  shell.stderr!.on('data', onChunk);
  shell.stdout!.on('end', onEnd);
  shell.stdin!.write(shellCommandInput(command, prompt));
}

// Asks the shell for its working directory. A shell that is gone, or whose output ends before the
// answer, completes with an empty result, which callers treat as nothing to report.
export function queryShellPwd(
  shell: ShellProcess,
  tabIndex: number,
  onResult: (pwd: string) => void,
): void {
  if (shellGone(shell)) { onResult(''); return; }
  const prompt = `__PWD_${tabIndex}_${Date.now()}__`;
  const paths = new PwdPathAccumulator();
  const output = new BoundedOutputAccumulator(prompt, 0, (text) => { paths.append(text); });

  const done = () => {
    shell.stdout!.removeListener('data', onData);
    shell.stderr!.removeListener('data', onData);
    shell.stdout!.removeListener('end', onEnd);
  };

  const onData = (chunk: string) => {
    if (!output.append(chunk)) return;
    done();
    onResult(paths.answer());
  };

  const onEnd = () => {
    output.flush();
    done();
    onResult('');
  };

  shell.stdout!.on('data', onData);
  shell.stderr!.on('data', onData);
  shell.stdout!.on('end', onEnd);
  shell.stdin!.write(shellPwdQueryInput(prompt));
}
