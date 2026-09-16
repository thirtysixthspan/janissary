import { connectionPhase, reconnectDelay, type ConnectionPhase } from './reconnect-policy';

export class SocketConnection {
  socket!: WebSocket;
  phase: ConnectionPhase = 'connected';
  private disposed = false;
  private attempts = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<(phase: ConnectionPhase) => void>();
  // Reset each time `connect()` mints a socket. Guards `handleClose` against running twice for the
  // same socket: a real `close` event and `terminate()`'s explicit call can both reach it, since a
  // test double may dispatch `close` synchronously from `terminate()`'s own `socket.close()` call.
  private closeHandled = false;

  constructor(private handlers: { open: () => void; close: () => void; message: (data: string) => void }) {
    this.connect();
  }

  subscribe(listener: (phase: ConnectionPhase) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reconnect(): void {
    if (this.disposed || this.socket.readyState === WebSocket.OPEN) return;
    this.handlers.close();
    this.attempts = 0;
    this.publish('reconnecting');
    clearTimeout(this.retry);
    this.connect();
  }

  // A suspend can tear down the TCP connection under an `OPEN` socket without the browser ever
  // firing `close` — `reconnect()`'s early return trusts `readyState`, which is exactly the lie a
  // half-open socket tells. The caller (a liveness probe that got no answer) calls this instead:
  // it closes the dead socket and runs the same drain/publish/backoff `close` would have, without
  // waiting on an event that may never arrive.
  terminate(): void {
    if (this.disposed) return;
    const socket = this.socket;
    socket.close();
    this.handleClose(socket);
  }

  dispose(): void {
    this.disposed = true;
    clearTimeout(this.retry);
    clearTimeout(this.deadline);
    this.listeners.clear();
    this.socket.close();
  }

  private publish(phase: ConnectionPhase): void {
    this.phase = phase;
    for (const listener of this.listeners) listener(phase);
  }

  private connect(): void {
    clearTimeout(this.deadline);
    const previous = this.socket;
    const token = new URLSearchParams(location.search).get('token') ?? '';
    const socket = new WebSocket(`ws://${location.host}/?token=${encodeURIComponent(token)}`);
    this.socket = socket;
    this.closeHandled = false;
    previous?.close();
    const current = () => !this.disposed && this.socket === socket;
    this.deadline = setTimeout(() => { if (current()) socket.close(); }, 10_000);
    socket.addEventListener('message', (event) => { if (current()) this.handlers.message(event.data as string); });
    socket.addEventListener('open', () => {
      if (!current()) return;
      clearTimeout(this.deadline);
      this.attempts = 0;
      this.handlers.open();
      this.publish('connected');
    });
    socket.addEventListener('close', () => { if (current()) this.handleClose(socket); });
  }

  // Shared by a real `close` event and `terminate()`'s forced one. `current()` is re-checked here
  // (not only by each caller) so a `terminate()` that raced a reconnect already under way — or the
  // native `close` event arriving after `terminate()` already handled the same socket — never runs
  // this twice for one dead connection.
  private handleClose(socket: WebSocket): void {
    if (this.disposed || this.socket !== socket || this.closeHandled) return;
    this.closeHandled = true;
    clearTimeout(this.deadline);
    this.handlers.close();
    this.publish(connectionPhase(this.attempts, false));
    clearTimeout(this.retry);
    this.retry = setTimeout(() => this.connect(), reconnectDelay(this.attempts++));
  }
}
