import { PassThrough, Writable } from 'node:stream';
import type { ShellProcess } from '../shell.js';
import type { RemoteChannel } from './channel.js';

/**
 * A remote agent tab's persistent shell, wearing the shape `ShellManager` and `executeShellCmd`
 * already consume. No second frame family is needed for it: spawning a program, writing to its
 * stdin, streaming its output, and reporting its exit is exactly what the process frames do.
 *
 * Two facts keep this an adapter rather than a shim. `executeShellCmd` runs every command inside a
 * `2>&1` group, so stderr is merged *by the remote shell* and the protocol never has to separate streams
 * or carry an exit code — `stderr` here is a `PassThrough` that nothing is ever routed to. And the
 * members actually touched are a tiny subset: `stdin.writable`/`stdin.write`, `stdout`/`stderr` as
 * `'data'` emitters of utf8 strings, and `kill()`.
 *
 * The shell is started in `pipe` mode: a tty's echo would feed each written command — including the
 * sentinel `echo` — straight back into the output buffer, matching the sentinel before the command
 * had run.
 */
export function createRemoteShell(
  channel: RemoteChannel,
  id: string,
  program: string,
  command: string,
  agentName?: string,
): ShellProcess {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.setEncoding('utf8');
  stderr.setEncoding('utf8');
  let live = true;

  const stdin = new Writable({
    write(chunk: Buffer | string, _encoding, callback) {
      channel.send({ type: 'input', id, data: typeof chunk === 'string' ? chunk : chunk.toString('utf8') });
      callback();
    },
  });

  channel.attach(id, {
    onOutput: (data) => { stdout.write(data); },
    onExit: () => { live = false; stdin.end(); stdout.end(); },
  });
  channel.send({
    type: 'spawn', id, program, command, mode: 'pipe', cols: 80, rows: 24,
    ...(agentName && { agentName }),
  });

  return {
    stdin,
    stdout,
    stderr,
    kill: () => {
      if (!live) return false;
      live = false;
      channel.send({ type: 'kill', id });
      channel.detach(id);
      return true;
    },
  };
}
