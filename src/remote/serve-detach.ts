import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { chmodSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isPidAlive } from '../instance-lock.js';
import { encodeFrame, type ClientFrame, type ServerFrame } from './protocol.js';
import { ReplayHistory } from './replay-history.js';
import { peerRecordPath, readPeerRecord, writePeerRecord } from './peer-record.js';
import { classifyPreAttachFrame, encodeCaptureReply, busyTransitionFrames } from './serve-detach-capture.js';

export const REMOTE_DETACH_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

// However long a peer stays detached, its replay buffer never grows past this — an ordinary
// detachment (minutes to hours) never comes close, while even a week of a chatty ACP agent or a
// busy remote shell cannot exhaust the remote host's memory.
export const PENDING_BUFFER_BUDGET_BYTES = 1_000_000;

export class DetachedPeer {
  private server: Server | undefined;
  private socket: Socket | undefined;
  private socketDir: string | undefined;
  private socketPath: string | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private sink: ((data: string) => void) | undefined;
  private pending: ServerFrame[] = [];
  private pendingBytes = 0;
  private dropped = false;
  private record: string;
  private stopped = false;
  private connections = new Set<Socket>();
  private pipes = new Set<string>();
  private history = new ReplayHistory();

  constructor(
    private root: string, readonly session: string,
    private receive: (data: string) => void, private expired: () => void,
    // Answers a non-attaching `capture-request` (decision 16): the far side's own live detection
    // pipeline, still running while parked, is what actually has the capture — this peer only routes
    // the query to it. Defaulted so every existing caller (including every test) needs no change.
    private getCapture: (id: string) => { text: string; capturedAt: number } | undefined = () => { /* no detection pipeline wired */ },
    private currentBusyStates: () => Iterable<{ id: string; busy: boolean; unread: boolean }> = () => [],
  ) {
    this.record = peerRecordPath(root, session);
  }

  async start(sink: (data: string) => void): Promise<void> {
    this.sink = sink;
    mkdirSync(path.dirname(this.record), { recursive: true, mode: 0o700 });
    this.socketDir = mkdtempSync(path.join(tmpdir(), 'janus-peer-'));
    chmodSync(this.socketDir, 0o700);
    const socketPath = path.join(this.socketDir, 'peer.sock');
    const server = createServer((socket) => this.accept(socket));
    this.server = server;
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(socketPath, resolve);
    });
    this.socketPath = socketPath;
    writePeerRecord(this.record, { pid: process.pid, socket: socketPath });
  }

  // Stamp the record with the label this peer is provisioning, before its clone starts, so another
  // `remote-serve` on this host asked for the same label sees it running and refuses. `pid` and
  // `socket` are rewritten unchanged; the readers of those two ignore the extra field.
  setLabel(label: string): void {
    if (this.stopped || this.socketPath === undefined) return;
    writePeerRecord(this.record, { pid: process.pid, socket: this.socketPath, label });
  }

  emit(frame: ServerFrame): void {
    if (this.stopped) return;
    if (frame.type === 'transcript' || frame.type === 'output') this.history.record(frame);
    else if (frame.type === 'exit') { this.pipes.delete(frame.id); this.history.forget(frame.id); }
    if (this.sink) { this.sink(`${encodeFrame(frame)}\n`); return; }
    // A snapshot of current state, not a log entry — see decision 20 of the auto-accept-while-detached
    // plan. Queuing it would replay every intermediate busy/ready flip on the next attach; `accept()`
    // sends one fresh frame from the classifier's retained value instead.
    if (frame.type === 'busy-transition') return;
    if (frame.type === 'output' && !this.pipes.has(frame.id)) return;
    const encoded = encodeFrame(frame);
    this.pending.push(frame);
    this.pendingBytes += encoded.length;
    while (this.pendingBytes > PENDING_BUFFER_BUDGET_BYTES) {
      const removed = this.pending.shift();
      if (!removed) break;
      this.pendingBytes -= encodeFrame(removed).length;
      this.dropped = true;
    }
  }

  track(frame: Extract<ClientFrame, { type: 'spawn' }>): void {
    if (frame.mode === 'pipe') this.pipes.add(frame.id);
  }

  // Retain what was written to a piped process, so an attach that rebuilds its tab can show each
  // command beside the output it produced. Only for a piped one: a pty echoes what is written to it,
  // and retaining that again would double every keystroke in a redrawn terminal.
  input(frame: Extract<ClientFrame, { type: 'input' }>): void {
    if (this.stopped || !this.pipes.has(frame.id)) return;
    this.history.recordInput(frame.id, frame.data);
  }

  detach(): void {
    if (this.stopped) return;
    this.sink = undefined;
    this.socket?.destroy();
    this.socket = undefined;
    this.expiry ??= setTimeout(this.expired, REMOTE_DETACH_TIMEOUT_MS);
  }

  dispose(): void {
    this.stopped = true;
    this.sink = undefined;
    this.pending = [];
    this.pendingBytes = 0;
    this.history.clear();
    clearTimeout(this.expiry);
    this.socket?.destroy();
    this.server?.close();
    for (const socket of this.connections) socket.destroy();
    rmSync(this.record, { force: true });
    if (this.socketDir) rmSync(this.socketDir, { recursive: true, force: true });
  }

  private accept(socket: Socket): void {
    this.connections.add(socket);
    let buffer = '';
    let attached = false;
    socket.setEncoding('utf8');
    socket.on('error', () => socket.destroy());
    socket.setTimeout(10_000, () => socket.destroy());
    socket.on('data', (data: string) => {
      if (attached) { this.receive(data); return; }
      buffer += data;
      if (buffer.length > 1024) { socket.destroy(); return; }
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      const classified = classifyPreAttachFrame(buffer.slice(0, newline), this.session);
      if (classified.kind === 'capture-request') {
        socket.end(encodeCaptureReply(classified.id, classified.request, this.getCapture(classified.id)));
        return;
      }
      if (classified.kind !== 'attach') {
        socket.end(`${encodeFrame({ type: 'attach-result', accepted: false })}\n`);
        return;
      }
      this.socket?.destroy();
      this.socket = socket;
      attached = true;
      socket.setTimeout(0);
      clearTimeout(this.expiry);
      this.expiry = undefined;
      this.sink = (chunk) => { socket.write(chunk); };
      this.emit({ type: 'attach-result', accepted: true, ...((this.dropped || this.history.truncated) && { truncated: true }) });
      this.dropped = false;
      const history = this.history.frames(classified.restore === true);
      for (const replay of history) socket.write(`${encodeFrame(replay)}\n`);
      const pending = this.pending.filter((pending) => !classified.restore || (pending.type !== 'transcript' && pending.type !== 'output'))
        .toSorted((a, b) => Number(a.type === 'exit') - Number(b.type === 'exit'));
      for (const frame of pending) socket.write(`${encodeFrame(frame)}\n`);
      this.pending = [];
      this.pendingBytes = 0;
      for (const busyFrame of busyTransitionFrames(this.currentBusyStates())) socket.write(`${encodeFrame(busyFrame)}\n`);
      this.receive(buffer.slice(newline + 1));
    });
    socket.on('close', () => {
      this.connections.delete(socket);
      if (this.socket === socket) this.detach();
    });
  }
}

export function relayPeer(
  root: string, session: string, output: (data: string) => void, ended: (terminated: boolean) => void,
  restore = false,
): Socket | undefined {
  const record = readPeerRecord(peerRecordPath(root, session));
  if (record === 'missing') { ended(true); return; }
  if (record === 'invalid') { ended(false); return; }
  if (!isPidAlive(record.pid)) { ended(true); return; }
  const socket = createConnection(record.socket);
  socket.setEncoding('utf8');
  socket.once('connect', () => socket.write(`${encodeFrame({ type: 'attach', session, ...(restore && { restore }) })}\n`));
  socket.on('data', output);
  socket.on('error', () => socket.destroy());
  socket.on('close', () => ended(false));
  return socket;
}
