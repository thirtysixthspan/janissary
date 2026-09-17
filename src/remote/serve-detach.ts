import { createServer, createConnection, type Server, type Socket } from 'node:net';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isPidAlive } from '../instance-lock.js';
import { decodeFrame, encodeFrame, type ClientFrame, type ServerFrame } from './protocol.js';

export const REMOTE_DETACH_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

// However long a peer stays detached, its replay buffer never grows past this — an ordinary
// detachment (minutes to hours) never comes close, while even a week of a chatty ACP agent or a
// busy remote shell cannot exhaust the remote host's memory.
export const PENDING_BUFFER_BUDGET_BYTES = 1_000_000;

export class DetachedPeer {
  private server: Server | undefined;
  private socket: Socket | undefined;
  private socketDir: string | undefined;
  private expiry: ReturnType<typeof setTimeout> | undefined;
  private sink: ((data: string) => void) | undefined;
  private pending: ServerFrame[] = [];
  private pendingBytes = 0;
  private dropped = false;
  private record: string;
  private stopped = false;
  private connections = new Set<Socket>();
  private pipes = new Set<string>();

  constructor(
    private root: string, readonly session: string,
    private receive: (data: string) => void, private expired: () => void,
  ) {
    this.record = path.join(root, '.janissary', 'remote', `${session}.json`);
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
    writeFileSync(this.record, JSON.stringify({ pid: process.pid, socket: socketPath }), { mode: 0o600 });
  }

  emit(frame: ServerFrame): void {
    if (this.stopped) return;
    if (this.sink) { this.sink(`${encodeFrame(frame)}\n`); return; }
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
      const frame = decodeFrame(buffer.slice(0, newline));
      if (!('type' in frame) || frame.type !== 'reattach' || frame.session !== this.session) {
        socket.end(`${encodeFrame({ type: 'reattach-result', accepted: false })}\n`);
        return;
      }
      this.socket?.destroy();
      this.socket = socket;
      attached = true;
      socket.setTimeout(0);
      clearTimeout(this.expiry);
      this.expiry = undefined;
      this.sink = (chunk) => { socket.write(chunk); };
      this.emit({ type: 'reattach-result', accepted: true, ...(this.dropped && { truncated: true }) });
      this.dropped = false;
      const pending = this.pending.toSorted((a, b) => Number(a.type === 'exit') - Number(b.type === 'exit'));
      for (const frame of pending) socket.write(`${encodeFrame(frame)}\n`);
      this.pending = [];
      this.pendingBytes = 0;
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
): Socket | undefined {
  let record: { pid: number; socket: string };
  try {
    record = JSON.parse(readFileSync(path.join(root, '.janissary', 'remote', `${session}.json`), 'utf8')) as typeof record;
  } catch (error) {
    ended((error as NodeJS.ErrnoException).code === 'ENOENT');
    return;
  }
  if (!record || !Number.isSafeInteger(record.pid) || record.pid <= 0 || typeof record.socket !== 'string') { ended(false); return; }
  if (!isPidAlive(record.pid)) { ended(true); return; }
  const socket = createConnection(record.socket);
  socket.setEncoding('utf8');
  socket.once('connect', () => socket.write(`${encodeFrame({ type: 'reattach', session })}\n`));
  socket.on('data', output);
  socket.on('error', () => socket.destroy());
  socket.on('close', () => ended(false));
  return socket;
}
