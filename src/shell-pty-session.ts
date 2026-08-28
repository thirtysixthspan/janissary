import { PassThrough, Writable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import type { ShellProcess } from './shell.js';
import { shellStartupArgs } from './shell-startup.js';

// A tab's persistent shell, running inside a pseudo-terminal instead of behind pipes, wearing the
// same shape `ShellManager` and `executeShellCmd` already consume.
//
// The reason this needs care is spelled out in `remote/shell-session.ts`: a tty echoes every line
// written to it, so the sentinel `echo "__JS_END_…__"` would come straight back and match before the
// command had run. The remote shell avoided that by staying in pipe mode; a tab that wants to detect
// interactive programs cannot, so it neutralizes the echo instead. Before any user command the shell
// is seeded with echo off and empty prompts, and everything up to the seed's own marker is discarded.
export type PtyShell = {
  shell: ShellProcess;
  ptyId: string;
};

export type PtyShellSpawn = {
  write: (data: string) => void;
  kill: () => void;
  id: string;
};

const SEED_COMMAND = "stty -echo 2>/dev/null; PS1=''; PS2=''";

// Everything the shell emits before this marker is the seed's own echo and prompt noise.
//
// The marker has to survive being echoed, because echo is still on while the seed command itself is
// read — so the marker is written to the shell split across two adjacent quoted strings. The shell
// joins them when it runs the `echo`, but the echoed *command line* keeps the quotes between them
// and therefore cannot match. Without this the first match found would be inside the echo of the
// seed command, and the shell's own noise would leak into the first command's output.
function seedMarker(): { marker: string; echoArgument: string } {
  const id = randomUUID().replaceAll('-', '');
  const head = '__JS_SEED_';
  const tail = `${id}__`;
  return { marker: `${head}${tail}`, echoArgument: `"${head}""${tail}"` };
}

/**
 * Wrap a spawned pseudo-terminal as a `ShellProcess`. The caller owns spawning (so the PTY can be
 * registered with the manager that reaps it); this module owns the stream shapes and the seed.
 */
export function createPtyShell(spawn: (onData: (data: string) => void) => PtyShellSpawn): PtyShell {
  const stdout = new PassThrough();
  // A pty merges stderr into stdout, so nothing is ever routed here — `executeShellCmd` attaches the
  // same listener to both, exactly as it does for the remote shell.
  const stderr = new PassThrough();
  stdout.setEncoding('utf8');
  stderr.setEncoding('utf8');

  const { marker, echoArgument } = seedMarker();
  let seeded = false;
  let pending = '';

  // Until the seed marker arrives, buffer rather than forward: the echoed seed command and any
  // prompt the shell printed before `PS1` was cleared must never reach a command's output.
  const onData = (data: string): void => {
    if (seeded) { stdout.write(data); return; }
    pending += data;
    const index = pending.indexOf(marker);
    if (index === -1) return;
    seeded = true;
    const rest = pending.slice(index + marker.length);
    pending = '';
    if (rest.trim()) stdout.write(rest.replace(/^\r?\n/, ''));
  };

  const session = spawn(onData);
  let live = true;

  const stdin = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      session.write(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
      callback();
    },
  });

  session.write(`${SEED_COMMAND}; echo ${echoArgument}\n`);

  return {
    ptyId: session.id,
    shell: {
      stdin,
      stdout,
      stderr,
      kill: () => {
        if (!live) return false;
        live = false;
        session.kill();
        stdin.end();
        stdout.end();
        return true;
      },
    },
  };
}

// The argv a tab's PTY-backed shell is spawned with: the shell itself, startup files suppressed,
// rather than `-lc <command>`.
export function ptyShellArgs(): string[] {
  return shellStartupArgs(process.env.SHELL || 'bash');
}
