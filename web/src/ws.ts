import type { ServerEvent, RpcCall, RouteChooserView } from './protocol';

type StateListener = (tabs: import('./protocol').TabView[], activeTab: number, route: RouteChooserView | null) => void;
type ExitListener = (id: string, exitCode: number) => void;

// Thin WebSocket client. State snapshots fan out to subscribers; PTY output is routed per-id to
// the terminal card that attached (with early bytes buffered so nothing is lost before mount).
export class JanusClient {
  private ws: WebSocket;
  private nextId = 1;
  private stateListeners = new Set<StateListener>();
  private exitListeners = new Set<ExitListener>();
  private ptyHandlers = new Map<string, (data: string) => void>();
  private ptyBuffers = new Map<string, string[]>();
  private pending = new Map<number, (result: unknown) => void>();

  constructor() {
    const token = new URLSearchParams(location.search).get('token') ?? '';
    this.ws = new WebSocket(`ws://${location.host}/?token=${encodeURIComponent(token)}`);
    this.ws.onmessage = (e) => this.onEvent(JSON.parse(e.data) as ServerEvent);
    this.ws.onopen = () => this.send({ method: 'init', params: {} });
  }

  private onEvent(ev: ServerEvent): void {
    if (ev.t === 'state') {
      for (const l of this.stateListeners) l(ev.tabs, ev.activeTab, ev.route ?? null);
    } else if (ev.t === 'pty') {
      const h = this.ptyHandlers.get(ev.id);
      if (h) h(ev.data);
      else { const b = this.ptyBuffers.get(ev.id) ?? []; b.push(ev.data); this.ptyBuffers.set(ev.id, b); }
    } else if (ev.t === 'pty-exit') {
      for (const l of this.exitListeners) l(ev.id, ev.exitCode);
    } else if (ev.t === 'bye') {
      // The server is shutting down (quit/exit); close this window.
      window.close();
    } else if (ev.t === 'rpc-reply') {
      const cb = this.pending.get(ev.id);
      if (cb) { this.pending.delete(ev.id); cb(ev.result); }
    }
  }

  send(call: RpcCall): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'rpc', id: this.nextId++, ...call }));
  }

  // Send an RPC and resolve with the server's reply result (used for Tab completion).
  request<T>(call: RpcCall): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve) => {
      if (this.ws.readyState !== WebSocket.OPEN) { resolve(undefined as T); return; }
      this.pending.set(id, (r) => resolve(r as T));
      this.ws.send(JSON.stringify({ t: 'rpc', id, ...call }));
    });
  }

  onState(l: StateListener): () => void { this.stateListeners.add(l); return () => this.stateListeners.delete(l); }
  onPtyExit(l: ExitListener): () => void { this.exitListeners.add(l); return () => this.exitListeners.delete(l); }

  // Register a terminal card's writer for a pty id, flushing any buffered early output first.
  attachPty(id: string, onData: (data: string) => void): () => void {
    const buffered = this.ptyBuffers.get(id);
    if (buffered) { for (const d of buffered) onData(d); this.ptyBuffers.delete(id); }
    this.ptyHandlers.set(id, onData);
    return () => this.ptyHandlers.delete(id);
  }
}
