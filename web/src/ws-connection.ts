import { connectionPhase, reconnectDelay, type ConnectionPhase } from './reconnect-policy';

export class SocketConnection {
  socket!: WebSocket;
  phase: ConnectionPhase = 'connected';
  private disposed = false;
  private attempts = 0;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private deadline: ReturnType<typeof setTimeout> | undefined;
  private listeners = new Set<(phase: ConnectionPhase) => void>();

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
    socket.addEventListener('close', () => {
      if (!current()) return;
      clearTimeout(this.deadline);
      this.handlers.close();
      this.publish(connectionPhase(this.attempts, false));
      clearTimeout(this.retry);
      this.retry = setTimeout(() => this.connect(), reconnectDelay(this.attempts++));
    });
  }
}
