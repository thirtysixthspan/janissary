import { messageBus } from '../bus.js';
import type { PtySession } from '../pty.js';
import type { RemoteChannel } from './channel.js';

// The decisions a remote process is started with, mirroring `spawnPty`'s own arguments. `program`
// is the *remote binary's* name (`claude`, not `ssh`), so the connections panel reports a
// local-looking `terminal:claude` row for a remote harness tab.
export type RemotePtyOptions = {
  id: string;
  program: string;
  command: string;
  harness?: string;
  offline?: boolean;
  cols: number;
  rows: number;
  agentName?: string;
};

/**
 * A process running on another machine, surfaced locally as an object satisfying `PtySession`
 * (`src/pty.ts`). `write`, `resize`, and `kill` send input/resize/kill frames; inbound output frames
 * are published on the message bus under the session's id — byte-for-byte what
 * `PseudoterminalManager.spawn` does for a local PTY. Everything already built on a PTY id (the
 * screen reader, the asciicast recorder, busy-status detection, auto-approve, `send`, `schedule`,
 * monitoring, the connections panel) therefore works without knowing where the process runs.
 */
export function createRemotePtySession(
  channel: RemoteChannel,
  options: RemotePtyOptions,
  onExit: (exitCode: number) => void,
): PtySession {
  const { id, program, command, harness, offline, cols, rows, agentName } = options;
  channel.attach(id, {
    onOutput: (data) => messageBus.emit('pty', { type: 'data', id, data }),
    onExit,
  });
  channel.send({
    type: 'spawn', id, program, command, mode: 'pty', harness, cols, rows, offline,
    ...(agentName && { agentName }),
  });
  return {
    id,
    program,
    write: (data) => channel.send({ type: 'input', id, data }),
    resize: (c, r) => channel.send({ type: 'resize', id, cols: Math.max(1, c), rows: Math.max(1, r) }),
    kill: () => channel.send({ type: 'kill', id }),
  };
}
