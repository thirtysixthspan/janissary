import type { ServerEvent, RpcCall, StateEvent } from '@shared/protocol';
import type { ClientStateCollectors } from './client-state-collectors';
import { PtyOutputBuffer, type PtyOutputBufferOptions } from './pty-output-buffer';
import { SocketConnection } from './ws-connection';
import type { ConnectionPhase } from './reconnect-policy';

export type StateListener = (snapshot: StateEvent) => void;
type ExitListener = (id: string, exitCode: number) => void;
export type LayoutListener = (event: {
  sidebarLeft?: number;
  sidebarRight?: number;
  tabAreaPct?: number;
  focusLeft?: 'files' | 'notifications';
  focusRight?: 'files' | 'notifications';
}) => void;

// What a request is answered with when its connection ends before the reply does. Nonempty, because
// `saveFile`'s caller displays it and an empty string reads there as success.
const CONNECTION_ENDED = 'connection closed';

// How long a wake's liveness probe waits for `init`'s reply before treating an `OPEN`-but-silent
// socket as dead. Generous enough that a server answering slowly under load is not mistaken for a
// half-open connection, short enough that a genuine wake still recovers promptly.
const LIVENESS_TIMEOUT_MS = 4000;

// What `request` resolves with: the server's value, or why there isn't one. `error` is absent only
// for a socket that was never open — every other failure (a connection that ended, a server refusal)
// carries the text, so a caller with somewhere to show it can tell those apart from the silence a
// closed socket has always resolved as.
export type RequestResult<T> = { ok: true; value: T } | { ok: false; error?: string };

// Thin WebSocket client. State snapshots fan out to subscribers; PTY output is routed per-id to
// the terminal card that attached (with early bytes buffered so nothing is lost before mount).
export class JanusClient {
  private connection: SocketConnection;
  private get ws(): WebSocket { return this.connection.socket; }
  private nextId = 1;
  private stateListeners = new Set<StateListener>();
  private exitListeners = new Set<ExitListener>();
  private layoutListeners = new Set<LayoutListener>();
  private ptyHandlers = new Map<string, (data: string) => void>();
  private ptyOutput: PtyOutputBuffer;
  private pending = new Map<number, (result: unknown, error?: string) => void>();
  private stateCollectors: Partial<ClientStateCollectors> = {};

  constructor(ptyOutputOptions: PtyOutputBufferOptions = {}) {
    this.ptyOutput = new PtyOutputBuffer(ptyOutputOptions);
    this.connection = new SocketConnection({
      message: (data) => this.onEvent(JSON.parse(data) as ServerEvent),
      open: () => this.send({ method: 'init', params: {} }),
      close: () => this.drainPending(),
    });
  }

  get connectionStatus(): ConnectionPhase { return this.connection.phase; }

  // A wake calls this regardless of the socket's reported state. `SocketConnection.reconnect()`
  // trusts `readyState`, which a suspend that tore down the TCP connection without a `close` event
  // leaves reporting `OPEN` — the backoff fallback in that case only runs on `close`, and `close`
  // is exactly what never arrives. An `OPEN` socket instead gets a cheap round trip; no answer
  // within `LIVENESS_TIMEOUT_MS` is treated as dead.
  reconnect(): void {
    if (this.ws.readyState !== WebSocket.OPEN) { this.connection.reconnect(); return; }
    const probed = this.ws;
    let settled = false;
    const deadline = setTimeout(() => {
      // The socket this probe was checking may have already closed and been replaced by the time
      // this fires — a real `close` event, a later reconnect, or `dispose` all move `this.ws` on
      // without necessarily running this callback's `.then()` first. Terminating a socket that is
      // no longer the one being probed would tear down an unrelated, possibly healthy connection.
      if (settled || this.ws !== probed) return;
      settled = true;
      this.connection.terminate();
    }, LIVENESS_TIMEOUT_MS);
    void this.request({ method: 'init', params: {} }).then(() => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
    });
  }

  onConnectionStatus(listener: (phase: ConnectionPhase) => void): () => void {
    return this.connection.subscribe(listener);
  }

  // Invoke a pending request's callback once and drop it. Every way a request can finish — its
  // reply, the connection ending, a send that threw — goes through here, so an id is answered at
  // most once and a late reply for an already-settled id finds nothing and is dropped.
  private settle(id: number, result: unknown, error?: string): void {
    const callback = this.pending.get(id);
    if (!callback) return;
    this.pending.delete(id);
    callback(result, error);
  }

  // Answer everything still waiting with a connection failure. A closed socket will never deliver
  // those replies, and a promise left pending strands the dialog or busy indicator built on it.
  // The map is swapped out before any callback runs, so this is idempotent — the close listener and
  // `dispose` can both call it, and `dispose` does both, since closing the socket fires the close
  // event in its own turn.
  //
  // Nothing is resent. A request whose reply was lost may still have been carried out by the server,
  // so replaying a mutating call could apply it twice.
  private drainPending(): void {
    const outstanding = this.pending;
    this.pending = new Map();
    for (const callback of outstanding.values()) callback(undefined, CONNECTION_ENDED);
  }

  // Hand a registered request to the socket. A `send` that throws settles it here rather than
  // leaving its callback in the map waiting for a reply nothing ever asked for.
  private dispatch(id: number, payload: string): void {
    try {
      this.ws.send(payload);
    } catch {
      this.settle(id, undefined, CONNECTION_ENDED);
    }
  }

  private onEvent(event: ServerEvent): void {
    switch (event.t) {
    case 'state': {
      // Must be `null`, not `undefined`: App gates the command line with `route !== null`, so an
      // `undefined` route reads as "chooser open" and silently swallows every keystroke (incl. Enter).
      const snapshot: StateEvent = {
        ...event, route: event.route ?? null,
        harnessLaunch: event.harnessLaunch ?? null, scheduleLaunch: event.scheduleLaunch ?? null,
      };
      for (const listener of this.stateListeners) listener(snapshot);
    
    break;
    }
    case 'pty': {
      const h = this.ptyHandlers.get(event.id);
      if (h) h(event.data);
      else this.ptyOutput.record(event.id, event.data);

    break;
    }
    case 'pty-exit': {
      this.ptyOutput.markExited(event.id);
      for (const l of this.exitListeners) l(event.id, event.exitCode);

    break;
    }
    case 'layout': {
      for (const l of this.layoutListeners) {
        l({
          sidebarLeft: event.sidebarLeft, sidebarRight: event.sidebarRight, tabAreaPct: event.tabAreaPct,
          focusLeft: event.focusLeft, focusRight: event.focusRight,
        });
      }

    break;
    }
    case 'collect-tree-state': {
      // `profile save` is asking for the tree selections only this client knows about. Answer with
      // whatever the registered collector reports, or an empty list when nothing has registered one.
      this.send({
        method: 'reportFileNavigatorSelection',
        params: { id: event.id, navigators: this.stateCollectors.fileNavigatorSelections?.() ?? [] },
      });

    break;
    }
    case 'bye': {
      // The server is shutting down (quit/exit); close this window.
      window.close();
    
    break;
    }
    case 'rpc-reply': {
      this.settle(event.id, event.result, event.error);

    break;
    }
    // No default
    }
  }

  send(call: RpcCall): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ t: 'rpc', id: this.nextId++, ...call }));
  }

  // Send an RPC and resolve with the server's reply. Callers branch on `ok` — what to show for a
  // failed request is each surface's own decision, not this method's — and on whether `error` is
  // present when it is not: absent means the socket was never open, present means the connection
  // ended before the reply arrived or the server refused the request.
  request<T>(call: RpcCall): Promise<RequestResult<T>> {
    const id = this.nextId++;
    return new Promise<RequestResult<T>>((resolve) => {
      if (this.ws.readyState !== WebSocket.OPEN) { resolve({ ok: false }); return; }
      this.pending.set(id, (r, error) => resolve(error === undefined ? { ok: true, value: r as T } : { ok: false, error }));
      this.dispatch(id, JSON.stringify({ t: 'rpc', id, ...call }));
    });
  }

  renameTab(index: number, title: string): void { this.send({ method: 'renameTab', params: { index, title } }); }

  // Set an editor tab's file name from the metadata row's rename input. Fire-and-forget, same as
  // editorSync: the renamed view comes back over the next state broadcast.
  renameEditorFile(url: string, name: string): void { this.send({ method: 'renameEditorFile', params: { url, name } }); }

  // Commit the tab's one file to origin on the current branch, revision history the same as the
  // navigator's commit: the save happens first, client-side, then this arms the cycle. Fire-and-
  // forget, same as editorSync.
  commitEditorFile(url: string, message: string): void { this.send({ method: 'commitEditorFile', params: { url, message } }); }


  // Sync an editor tab's in-progress buffer to the server as transient draft state. Fire-and-forget:
  // no reply is awaited, and a sync lost to a closed socket is simply dropped (see send()).
  editorSync(url: string, content: string): void { this.send({ method: 'editorSync', params: { url, content } }); }

  // Report the current sidebar/tab-area sizes after a manual resize completes. Fire-and-forget,
  // same as editorSync.
  reportLayout(sidebarLeft: number, sidebarRight: number, tabAreaPct: number): void {
    this.send({ method: 'reportLayout', params: { sidebarLeft, sidebarRight, tabAreaPct } });
  }

  // Sync a page tab's currently visible text (from the extension content script) to the server as
  // transient snapshot state. Fire-and-forget, same as editorSync. (Page snapshots reach the
  // server's plugin context through the plugin intent path — see src/plugins/context.ts and
  // src/plugins/page/activate.ts — not through a sync call here.)

  // Write an editor buffer back to disk. Resolves with the server's error message, or undefined
  // on success (including when the socket is down, which surfaces as a generic failure).
  async saveFile(url: string, content: string): Promise<string | undefined> {
    const result = await this.request<unknown>({ method: 'saveFile', params: { url, content } });
    return result.ok ? undefined : (result.error ?? 'not connected');
  }

  // The session token travels in the query string, so anything served over HTTP rather than the
  // socket has to carry it. This is where that rule lives — callers that must hand a URL to
  // something else (an `<img src>`, a plugin's own fetch) build it here rather than repeating it.
  resourceUrl(reference: string): string {
    const token = new URLSearchParams(location.search).get('token') ?? '';
    return `${reference}?token=${encodeURIComponent(token)}`;
  }

  // Read a file's contents over HTTP. Throws on a non-ok response rather than resolving with an
  // error message the way `saveFile` does: both callers already treat a failed read as their own
  // concern — one shows "failed to load", the other retries on the next change.
  async readFile(url: string): Promise<string> {
    const response = await fetch(this.resourceUrl(url));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }

  // Register the function that answers a server request for client-only state. Returns the
  // unregister, like every other subscription here, so an effect can hand it straight back.
  registerStateCollector<K extends keyof ClientStateCollectors>(
    name: K, collect: ClientStateCollectors[K],
  ): () => void {
    this.stateCollectors[name] = collect;
    return () => { delete this.stateCollectors[name]; };
  }

  onState(l: StateListener): () => void { this.stateListeners.add(l); return () => this.stateListeners.delete(l); }
  onPtyExit(l: ExitListener): () => void { this.exitListeners.add(l); return () => this.exitListeners.delete(l); }
  onLayout(l: LayoutListener): () => void { this.layoutListeners.add(l); return () => this.layoutListeners.delete(l); }

  // Register a terminal card's writer for a pty id, flushing any buffered early output first.
  attachPty(id: string, onData: (data: string) => void): () => void {
    this.ptyOutput.drain(id, onData);
    this.ptyHandlers.set(id, onData);
    return () => this.ptyHandlers.delete(id);
  }

  // Release everything the constructor and the subscription methods acquired. In-flight
  // `request()`/`saveFile()` promises are settled as connection failures rather than dropped: the
  // page is usually going away, but a client can also be disposed while its window lives on — a
  // back/forward-cache restore replaces one — and a promise nobody ever settles keeps whatever was
  // waiting on it waiting.
  dispose(): void {
    this.connection.dispose();
    this.stateListeners.clear();
    this.exitListeners.clear();
    this.layoutListeners.clear();
    this.ptyHandlers.clear();
    this.ptyOutput.dispose();
    this.drainPending();
    this.stateCollectors = {};
  }
}
