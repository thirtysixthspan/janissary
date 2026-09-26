import { createConnection } from 'node:net';
import { decodeFrame, encodeFrame, type ServerFrame } from './protocol.js';
import type { ScreenCapture } from '../harness/screen.js';
import { peerRecordPath, readPeerRecord } from './peer-record.js';

/**
 * A `janus remote-serve` process with no workspace of its own (a fresh ssh session relaying a query
 * rather than provisioning) asks a peer parked on the same host for one process's latest screen
 * capture, without attaching it. Mirrors `relayPeer`'s socket lookup, but for a single request/reply
 * instead of an ongoing relay: this connection sends exactly one `capture-request` and resolves with
 * whatever `capture-reply` (or nothing, on any failure) comes back.
 *
 * The one place this differs from `relayPeer` on purpose: no `isPidAlive` pre-check. A dead pid's
 * stale socket file fails to connect the same way an unreachable one does, and both resolve to
 * `undefined` here — there is no ended-tab UI on this path that needs to tell the two apart.
 */
export function requestParkedCapture(
  root: string, session: string, id: string, request: string,
): Promise<{ text: string; capturedAt: number } | undefined> {
  return new Promise((resolve) => {
    const record = readPeerRecord(peerRecordPath(root, session));
    if (typeof record === 'string') { resolve(undefined); return; }
    const socket = createConnection(record.socket);
    let buffer = '';
    let settled = false;
    const finish = (value: { text: string; capturedAt: number } | undefined): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(value);
    };
    socket.setEncoding('utf8');
    socket.setTimeout(10_000, () => finish(undefined));
    socket.once('connect', () => socket.write(`${encodeFrame({ type: 'capture-request', session, id, request })}\n`));
    socket.on('data', (data: string) => {
      buffer += data;
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      const frame = decodeFrame(buffer.slice(0, newline));
      if ('type' in frame && frame.type === 'capture-reply' && frame.id === id && frame.request === request
        && frame.text !== undefined && frame.capturedAt !== undefined) {
        finish({ text: frame.text, capturedAt: frame.capturedAt });
      } else finish(undefined);
    });
    socket.on('error', () => finish(undefined));
    socket.on('close', () => finish(undefined));
  });
}

// Answers a `capture-request` client frame — directly, when this process holds the live workspace
// (decision 15), or by relaying into a parked peer on the same host, when it does not (decision 16,
// `requestParkedCapture` above). Split out of `RemoteServer.dispatch()`'s switch so that arm stays
// one line, the way every other case in it does.
export function answerCaptureRequest(
  frame: { session: string; id: string; request: string },
  processes: { latestCapture: (id: string) => ScreenCapture | undefined } | undefined,
  // Undefined when this process has no root to find a parked peer under, which answers as "no
  // capture yet" does.
  root: string | undefined,
  emit: (frame: ServerFrame) => void,
): void {
  if (processes) {
    const capture = processes.latestCapture(frame.id);
    emit({ type: 'capture-reply', id: frame.id, request: frame.request, ...(capture && { text: capture.text, capturedAt: capture.capturedAt }) });
    return;
  }
  if (root === undefined) { emit({ type: 'capture-reply', id: frame.id, request: frame.request }); return; }
  void requestParkedCapture(root, frame.session, frame.id, frame.request).then((capture) => {
    emit({ type: 'capture-reply', id: frame.id, request: frame.request, ...(capture && { text: capture.text, capturedAt: capture.capturedAt }) });
  });
}
