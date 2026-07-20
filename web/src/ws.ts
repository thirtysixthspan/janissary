import type { ServerEvent, RpcCall, RouteChooserView, HarnessLaunchView, ScheduleLaunchView, TabView, TaskRow } from '@shared/protocol';

type StateListener = (tabs: TabView[], activeTab: number, route: RouteChooserView | null, tabNameMaxLength: number, globalHistory: string[], syntaxTheme: string, theme: string, tasks: TaskRow[], janissaryTasksDir: string, profiles: string[], projectDir: string, version: string, harnessLaunch: HarnessLaunchView | null, scheduleLaunch: ScheduleLaunchView | null) => void;
type ExitListener = (id: string, exitCode: number) => void;
type LayoutListener = (event: {
  sidebarLeft?: number;
  sidebarRight?: number;
  tabAreaPct?: number;
  focusLeft?: 'files' | 'notifications' | 'schedules';
  focusRight?: 'files' | 'notifications' | 'schedules';
}) => void;

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
      for (const l of this.stateListeners) l(event.tabs, event.activeTab, event.route ?? null, event.tabNameMaxLength, event.globalHistory, event.syntaxTheme, event.theme, event.tasks, event.janissaryTasksDir, event.profiles, event.projectDir, event.version, event.harnessLaunch ?? null, event.scheduleLaunch ?? null);
    
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
    case 'bye': {
      // The server is shutting down (quit/exit); close this window.
      window.close();
    
    break;
    }
    case 'rpc-reply': {
      const callback = this.pending.get(event.id);
      if (callback) { this.pending.delete(event.id); callback(event.result, event.error); }
    
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

  renameTab(index: number, title: string): void { this.send({ method: 'renameTab', params: { index, title } }); }

  navigatePage(index: number, url: string): void { this.send({ method: 'navigatePage', params: { index, url } }); }

  // Sync an editor tab's in-progress buffer to the server as transient draft state. Fire-and-forget:
  // no reply is awaited, and a sync lost to a closed socket is simply dropped (see send()).
  editorSync(url: string, content: string): void { this.send({ method: 'editorSync', params: { url, content } }); }

  // Sync a page tab's currently visible text (from the extension content script) to the server as
  // transient snapshot state. Fire-and-forget, same as editorSync.
  pageSync(url: string, text: string): void { this.send({ method: 'pageSync', params: { url, text } }); }

  // Write an editor buffer back to disk. Resolves with the server's error message, or undefined
  // on success (including when the socket is down, which surfaces as a generic failure).
  saveFile(url: string, content: string): Promise<string | undefined> {
    const id = this.nextId++;
    return new Promise((resolve) => {
      if (this.ws.readyState !== WebSocket.OPEN) { resolve('not connected'); return; }
      this.pending.set(id, (_result, error) => resolve(error));
      this.ws.send(JSON.stringify({ t: 'rpc', id, method: 'saveFile', params: { url, content } }));
    });
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
}
