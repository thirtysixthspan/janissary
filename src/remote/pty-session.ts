import { messageBus } from '../bus.js';
import { notify } from '../notifications/index.js';
import { writeCaptureFile } from '../harness/capture/file.js';
import type { PtySession } from '../pty.js';
import type { Managers } from '../managers.js';
import type { RemoteChannel } from './channel/index.js';

// The decisions a remote process is started with, mirroring `spawnPty`'s own arguments. `program`
// is the *remote binary's* name (`claude`, not `ssh`), so the connections panel reports a
// local-looking `terminal:claude` row for a remote harness tab.
export type RemotePtyOptions = {
  id: string;
  program: string;
  command: string;
  harness?: string;
  offline?: boolean;
  // `-b`: the remote starts its own e2e browser for this process. A fact the remote acts on, not a
  // value computed here — the endpoint it produces names ports on that host.
  browser?: boolean;
  cols: number;
  rows: number;
  agentName?: string;
  // Whether the far side should auto-approve this harness's own permission gates. Meaningful only
  // alongside `harness`; ignored by the far side for anything else, same as `harness` itself.
  autoApprove?: boolean;
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
  managers: Managers,
  options: RemotePtyOptions,
  onExit: (exitCode: number) => void,
): PtySession {
  const { id, program, command, harness, offline, browser, cols, rows, agentName, autoApprove } = options;
  let attaching = true;
  const pending: Array<() => void> = [];
  const deliver = (callback: () => void) => {
    if (attaching) pending.push(callback);
    else callback();
  };
  channel.attach(id, {
    onOutput: (data) => deliver(() => messageBus.emit('pty', { type: 'data', id, data })),
    onExit: (exitCode) => deliver(() => onExit(exitCode)),
    // Only ever fires for a harness spawn — the far side never emits either frame for anything else
    // (see `REMOTE_PROTOCOL_VERSION`'s version-18 comment in `./protocol.js`) — so `agentName` (the
    // owning tab's label, always set for a harness spawn by `registerRemotePty`) is always present
    // here. Translates the far side's report into exactly what a local detector would have produced:
    // a capture file, a `notify()` call, and the same busy-dot/unread calls `busyStatusHandler`
    // makes. A live report (`replayed` false) is stamped with no detection time so it toasts like a
    // local one would; a report replayed after a reattach is stamped with the original detection
    // time (not now) so it is dated in the feed and never toasted.
    onGateEvent: (message, capturedAt, replayed, capture) => deliver(() => {
      const label = agentName ?? '';
      const openFile = capture === undefined ? undefined : writeCaptureFile(label, capturedAt, capture);
      notify(managers, 'auto-approve', label, message, openFile, undefined, replayed ? new Date(capturedAt) : undefined);
    }),
    onBusyTransition: (busy, unread) => deliver(() => {
      const label = agentName ?? '';
      if (busy) managers.tab.addBusy(label);
      else {
        managers.tab.deleteBusy(label);
        if (unread) managers.tab.markUnread(label);
      }
      messageBus.emit('state', { type: 'dirty' });
    }),
  });
  if (pending.length === 0) attaching = false;
  else queueMicrotask(() => {
    attaching = false;
    for (const callback of pending) callback();
    pending.length = 0;
  });
  channel.send({
    type: 'spawn', id, program, command, mode: 'pty', harness, cols, rows, offline, browser, autoApprove,
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
