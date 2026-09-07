import type { ServerEvent, RpcCall, RouteChooserView, HarnessLaunchView, ScheduleLaunchView, TabView, TaskRow, ProfileRow } from '@shared/protocol';
import type { ClientStateCollectors } from './client-state-collectors';

export type StateListener = (
  tabs: TabView[], activeTab: number, secondaryTab: number | undefined,
  route: RouteChooserView | null, tabNameMaxLength: number, globalHistory: string[],
  syntaxTheme: string, theme: string, tasks: TaskRow[], janissaryTasksDir: string,
  profiles: ProfileRow[], projectDir: string, version: string,
  harnessLaunch: HarnessLaunchView | null, scheduleLaunch: ScheduleLaunchView | null,
  activeTabNameMaxLength?: number,
) => void;
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

// Thin WebSocket client. State snapshots fan out to subscribers; PTY output is routed per-id to
// the terminal card that attached (with early bytes buffered so nothing is lost before mount).
export class JanusClient {
  private ws: WebSocket;
  private nextId = 1;
  private stateListeners = new Set<StateListener>();
  private exitListeners = new Set<ExitListener>();
  private layoutListeners = new Set<LayoutListener>();
  private ptyHandlers = new Map<string, (data: string) => void>();
  private ptyBuffers = new Map<string, string[]>();
  private pending = new Map<number, (result: unknown, error?: string) => void>();
  private stateCollectors: Partial<ClientStateCollectors> = {};

  constructor() {
    const token = new URLSearchParams(location.search).get('token') ?? '';
    this.ws = new WebSocket(`ws://${location.host}/?token=${encodeURIComponent(token)}`);
    this.ws.addEventListener('message', (event) => this.onEvent(JSON.parse(event.data) as ServerEvent));
    this.ws.addEventListener('open', () => this.send({ method: 'init', params: {} }));
    this.ws.addEventListener('close', () => { this.drainPending(); });
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
      for (const listener of this.stateListeners) {
        listener(
          event.tabs, event.activeTab, event.secondaryTab, event.route ?? null,
          event.tabNameMaxLength, event.globalHistory, event.syntaxTheme, event.theme,
          event.tasks, event.janissaryTasksDir, event.profiles, event.projectDir, event.version,
          event.harnessLaunch ?? null, event.scheduleLaunch ?? null, event.activeTabNameMaxLength,
        );
      }
    
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

  // Send an RPC and resolve with the server's reply result (used for Tab completion).
  request<T>(call: RpcCall): Promise<T> {
    const id = this.nextId++;
    return new Promise<T>((resolve) => {
      if (this.ws.readyState !== WebSocket.OPEN) { resolve(undefined as T); return; }
      this.pending.set(id, (r) => resolve(r as T));
      this.dispatch(id, JSON.stringify({ t: 'rpc', id, ...call }));
    });
  }

  renameTab(index: number, title: string): void { this.send({ method: 'renameTab', params: { index, title } }); }


  // Sync an editor tab's in-progress buffer to the server as transient draft state. Fire-and-forget:
  // no reply is awaited, and a sync lost to a closed socket is simply dropped (see send()).
  editorSync(url: string, content: string): void { this.send({ method: 'editorSync', params: { url, content } }); }

  // Report the current sidebar/tab-area sizes after a manual resize completes. Fire-and-forget,
  // same as editorSync.
  reportLayout(sidebarLeft: number, sidebarRight: number, tabAreaPct: number): void {
    this.send({ method: 'reportLayout', params: { sidebarLeft, sidebarRight, tabAreaPct } });
  }

  // Sync a page tab's currently visible text (from the extension content script) to the server as
  // transient snapshot state. Fire-and-forget, same as editorSync.

  // Write an editor buffer back to disk. Resolves with the server's error message, or undefined
  // on success (including when the socket is down, which surfaces as a generic failure).
  saveFile(url: string, content: string): Promise<string | undefined> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      if (this.ws.readyState !== WebSocket.OPEN) { resolve('not connected'); return; }
      this.pending.set(id, (_result, error) => resolve(error));
      this.dispatch(id, JSON.stringify({ t: 'rpc', id, method: 'saveFile', params: { url, content } }));
    });
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
    const buffered = this.ptyBuffers.get(id);
    if (buffered) { for (const d of buffered) onData(d); this.ptyBuffers.delete(id); }
    this.ptyHandlers.set(id, onData);
    return () => this.ptyHandlers.delete(id);
  }

  // Release everything the constructor and the subscription methods acquired. In-flight
  // `request()`/`saveFile()` promises are settled as connection failures rather than dropped: the
  // page is usually going away, but a client can also be disposed while its window lives on — a
  // back/forward-cache restore replaces one — and a promise nobody ever settles keeps whatever was
  // waiting on it waiting.
  dispose(): void {
    this.ws.close();
    this.stateListeners.clear();
    this.exitListeners.clear();
    this.layoutListeners.clear();
    this.ptyHandlers.clear();
    this.ptyBuffers.clear();
    this.drainPending();
    this.stateCollectors = {};
  }
}
