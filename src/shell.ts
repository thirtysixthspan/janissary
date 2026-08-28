import { spawn, type ChildProcess } from 'node:child_process';
import { sandboxSpawn, type SandboxOptions } from './sandbox/index.js';
import { shellStartupArgs } from './shell-startup.js';

// The subset of `ChildProcess` that shell execution actually touches: `stdin`'s writability and
// `write`, `stdout`/`stderr` as `'data'` emitters, and `kill()`. Narrow enough that a process
// running on another machine can satisfy it (see `src/remote/shell-session.ts`) without pretending
// to be a real local child.
export type ShellProcess = Pick<ChildProcess, 'stdin' | 'stdout' | 'stderr' | 'kill'>;

// `sandbox`, when given a `workspaceDir`, confines the shell (and everything it spawns) to that
// workspace (see src/sandbox/index.ts); omitted or workspaceDir-less, the shell runs exactly as before.
export function spawnShell(
  _tabIndex: number,
  extraEnvironment?: Record<string, string>,
  sandbox?: SandboxOptions,
): ChildProcess {
  const baseEnv = { ...process.env, ...extraEnvironment };
  const shellPath = process.env.SHELL || 'bash';
  const { command, args, env } = sandboxSpawn(sandbox ?? {}, shellPath, shellStartupArgs(shellPath), baseEnv);
  const shell = spawn(command, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    env,
  });
  shell.stdout.setEncoding('utf8');
  shell.stderr.setEncoding('utf8');
  // Swallow EPIPE on stdin: the shell may exit while a write is in flight (e.g. during test cleanup).
  shell.stdin.on('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
  return shell;
}

// What is written to a shell to run one command and mark the end of its output.
//
// It is deliberately a *single logical line*: a brace group the shell has to read all the way to its
// closing `}` — and past the `; echo` that follows on the same line — before it can run anything.
// Written as two lines instead, the delimiter's `echo` would still be sitting unread in the shell's
// input when the command starts, and a shell hands that input straight to the command it runs. A
// command that reads its own stdin — a password prompt, a `read`, a REPL, anything promoted to a
// terminal — then consumes the delimiter as its own input, so the delimiter never arrives and the
// command never ends.
//
// The group runs in the current shell, so `cd`, variable assignments, and exit status are unchanged.
// The leading `:` guards the empty and comment-only cases, which would otherwise make the group a
// syntax error and take the delimiter's `echo` down with it.
export function shellCommandInput(command: string, delimiter: string): string {
  return `{ :; ${command}\n} 2>&1; echo "${delimiter}"\n`;
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
  if (shell.stdin?.writable) shell.stdin.write(`pwd\necho "${prompt}"\n`);
}
