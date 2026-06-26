import type { ServerEvent, RpcCall, RouteChooserView, TabView } from '@shared/protocol';

type StateListener = (tabs: TabView[], activeTab: number, route: RouteChooserView | null) => void;
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
    this.ws.addEventListener('message', (event) => this.onEvent(JSON.parse(event.data) as ServerEvent));
    this.ws.addEventListener('open', () => this.send({ method: 'init', params: {} }));
  }

  private onEvent(event: ServerEvent): void {
    switch (event.t) {
    case 'state': {
      // Must be `null`, not `undefined`: App gates the command line with `route !== null`, so an
      // `undefined` route reads as "chooser open" and silently swallows every keystroke (incl. Enter).
      for (const l of this.stateListeners) l(event.tabs, event.activeTab, event.route ?? null);
    
    break;
    }
    case 'pty': {
      const h = this.ptyHandlers.get(event.id);
      if (h) h(event.data);
      else { const b = this.ptyBuffers.get(event.id) ?? []; b.push(event.data); this.ptyBuffers.set(event.id, b); }
    
    break;
    }
    case 'pty-exit': {
      for (const l of this.exitListeners) l(event.id, event.exitCode);
    
    break;
    }
    case 'bye': {
      // The server is shutting down (quit/exit); close this window.
      window.close();
    
    break;
    }
    case 'rpc-reply': {
      const callback = this.pending.get(event.id);
      if (callback) { this.pending.delete(event.id); callback(event.result); }
    
    break;
    }
    // No default
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
