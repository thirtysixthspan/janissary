import path from 'node:path';
import type { TabPluginNotification, TabPluginServerCapabilities } from '../api.js';
import { isInsideRoot } from '../files.js';
import { startScan, type ScanHandle, type ScanMatcherFactory, type ScanRead } from './scan.js';
import { patternError } from './compile-matcher.js';
import { modesFrom, sameModes, type SearchModes } from './saved-modes.js';
import { refusalLine, sameScope, scopeDisplay, scopeFrom, type SearchScope } from './scope.js';
import { scopeFileAccess } from './scope-files.js';
import { enterScope } from './scope-ride.js';
import { scopeGone } from './scope-gone.js';
import type { SearchIntent, SearchMatch, SearchPayload } from './shared.js';

type RescopeOutcome = 'same' | 'moved' | 'join-failed';
type TabsNotification = Extract<TabPluginNotification, { topic: 'tabs' }>;

const INSTANCE_KEY = 'search';
const TAB_TITLE = 'search';

export function emptyPayload(): SearchPayload {
  return {
    query: '', include: '', exclude: '',
    regex: false, matchCase: false, wholeWord: false,
    state: 'done', message: '', rows: [], seed: 0, scope: '$root',
  };
}

function payloadOf(
  base: SearchPayload, changes: Partial<SearchPayload>,
): SearchPayload {
  const payload = { ...base, ...changes };
  if (payload.host === undefined) delete payload.host;
  return payload;
}

// The state one search tab holds between calls: what it currently shows, and the scan still feeding
// it. Kept beside `activate.ts` rather than inside it because it is the plugin's whole lifetime —
// `dispose` has to reach the scan through it — and `activate.ts` is about wiring handlers.
//
// The rows accumulate here rather than being sent whole each time, so a batch arriving appends to
// what the tab already shows instead of replacing it. One scan is in flight at a time: a new query
// cancels the previous one, which is what keeps a superseded scan's rows off the screen.
//
// The capabilities the session is built with are only for what needs no origin tab: publishing to
// the tab by its instance key, the settings, and the project file list. Anything that acts for the
// tab a request came from — opening or focusing the search tab, opening an editor, noting an error —
// goes through that request's own capabilities, because the first caller's origin may since have
// closed.
export class SearchSession {
  private payload: SearchPayload;
  private scan: ScanHandle | null = null;
  private root = '';
  // The scope that produced `root`. A remote row opens only while that scope is still the tab's own,
  // because a re-scope releases the channel that could serve it.
  private rootScope: SearchScope = { kind: 'launch' };
  // The workspace the tab searches. A route from a workspaced tab moves it; a rebuilt tab starts
  // back at the launch directory.
  private scope: SearchScope = { kind: 'launch' };
  // The modes as last read from or written to the config, so a search that changes none of them
  // does not rewrite the file on every keystroke.
  private saved: SearchModes;

  constructor(
    private capabilities: TabPluginServerCapabilities,
    // Overridable so a test can supply file contents without a filesystem. Production always reads
    // the real file, which is the only route a result's text can come from — and because the
    // contents are already in hand when one is supplied, its size is the contents' own length.
    private contents?: ScanRead,
    private createMatcher?: ScanMatcherFactory,
  ) {
    this.saved = modesFrom(capabilities.readSettings());
    this.payload = payloadOf(emptyPayload(), this.saved);
  }

  // Open the tab if it is not already open, or focus the one that is. A `search` command with an
  // argument seeds the query and starts a scan; a bare `search` just reveals the tab, so the chord
  // and the command both land the user in the same place with whatever they last searched for.
  //
  // The route's origin decides the scope. A workspace that is not ready or is gone is refused with a
  // line in the notifications feed, and nothing opens.
  open(argument: string, capabilities: TabPluginServerCapabilities): void {
    const decision = scopeFrom(capabilities.originTab());
    if (decision.kind === 'refuse') {
      capabilities.notifyUser(refusalLine(decision.reason, decision.label));
      return;
    }
    const query = argument.trim();
    if (query !== '') this.payload = payloadOf(this.payload, { seed: this.payload.seed + 1 });
    // The host runs this factory only when it has to build the tab, which means the previous one was
    // closed — and closing a tab forgets its query, results, narrowing fields, history, and scope.
    // Only the toggles, remembered on purpose, and the seed, which only moves forward, carry over.
    capabilities.openOrFocusTab(INSTANCE_KEY, () => {
      this.cancel();
      this.scope = { kind: 'launch' };
      this.payload = payloadOf(emptyPayload(), {
        ...modesFrom(this.payload), seed: this.payload.seed, query,
      });
      return { title: TAB_TITLE, payload: this.payload };
    });
    const interrupted = this.payload.state === 'searching';
    const outcome = decision.kind === 'scope' ? this.rescope(decision.scope, capabilities) : 'same';
    if (outcome === 'join-failed') {
      if (interrupted) this.rerun(capabilities);
      return;
    }
    if (query !== '') this.run({ ...this.payload, query }, capabilities);
    else if (outcome === 'moved') this.rerun(capabilities);
  }

  // Move to `target` when it searches other files, cancelling the scan of the old scope and moving
  // the tab's remote channel with it. A target whose channel cannot be joined is reported, and the
  // tab stays where it is unless that, too, is no longer reachable, in which case it falls back to
  // the launch directory with its rows cleared. Either way a failed join searches nothing; `open`
  // searches the scope the tab ends up with again only when the cancel interrupted a running scan.
  private rescope(target: SearchScope, capabilities: TabPluginServerCapabilities): RescopeOutcome {
    if (sameScope(target, this.scope)) return 'same';
    this.cancel();
    const entry = enterScope(target, this.scope, this.capabilities);
    if (entry.joinFailed) capabilities.notifyUser(refusalLine('gone', target.kind === 'remote' ? target.label : ''));
    if (sameScope(entry.scope, this.scope)) return entry.joinFailed ? 'join-failed' : 'same';
    this.scope = entry.scope;
    this.payload = payloadOf(this.payload, {
      scope: scopeDisplay(entry.scope),
      host: entry.scope.kind === 'remote' ? entry.scope.host : undefined,
    });
    if (!entry.joinFailed) return 'moved';
    this.payload = payloadOf(this.payload, { rows: [], state: 'done', message: '' });
    this.publish();
    return 'join-failed';
  }

  // A bare route that changed scope searches the current request again in the new one. With no
  // query there is nothing to search, but the old scope's rows must not stay clickable.
  private rerun(capabilities: TabPluginServerCapabilities): void {
    const { query, include, exclude, regex, matchCase, wholeWord } = this.payload;
    if (query.trim() !== '') {
      this.run({ query, include, exclude, regex, matchCase, wholeWord }, capabilities);
      return;
    }
    this.payload = payloadOf(this.payload, { rows: [], state: 'done', message: '' });
    this.publish();
  }

  // Start a scan for a query and its filters, replacing whatever the tab was showing. The tab is
  // repainted into the searching state immediately so the body reads `Searching…` before the first
  // row lands, and rows append as batches arrive. Only the query half of the payload is taken; the
  // rest is what this method produces.
  //
  // A regular expression that will not compile starts no scan: the tab shows why, and the reason is
  // noted through `reporter` — the calling request's own capabilities, whose origin is the transcript
  // the search tab was opened from — rather than settling as a search that found nothing.
  run(request: SearchIntent, reporter: TabPluginServerCapabilities = this.capabilities): void {
    this.remember(request);
    this.cancel();
    const invalid = patternError(request.query, request);
    if (invalid !== null) {
      this.payload = payloadOf(this.payload, { ...request, state: 'error', message: invalid, rows: [] });
      this.publish();
      reporter.note(invalid);
      return;
    }
    this.payload = payloadOf(this.payload, { ...request, state: 'searching', message: '', rows: [] });
    this.publish();
    const contents = this.contents;
    const scope = this.scope;
    const access = scopeFileAccess(scope, this.capabilities);
    const scan: ScanHandle = startScan({
      listFiles: async () => {
        const listed = await access.listFiles();
        if (this.scan === scan) {
          this.root = listed.root;
          this.rootScope = scope;
        }
        return listed;
      },
      readCandidate: access.readCandidate,
      readFile: contents,
      fileSize: contents === undefined ? undefined : async (absPath) => {
        try {
          const text = await contents(absPath);
          return text.length;
        } catch {
          return null;
        }
      },
      createMatcher: this.createMatcher,
      onBatch: (batch) => this.receive(batch.rows, batch.done, batch.error),
    }, request);
    this.scan = scan;
  }

  // Put the file a result names on the line that result names, in an editor tab. The path arrived
  // from the client, and `path.join` collapses `..`, so it is resolved and checked against the
  // project root before it goes anywhere: a row's path is one the scan itself produced, and a
  // client that names anything else gets nothing. The editor opens through the asking request's own
  // capabilities, so it is attributed to the search tab that asked.
  openMatch(relPath: string, line: number, capabilities: TabPluginServerCapabilities): void {
    const target = path.join(this.root, relPath);
    if (!isInsideRoot(this.root, target)) return;
    if (this.rootScope.kind !== 'remote') {
      capabilities.openInEditor(target, line);
      return;
    }
    if (!sameScope(this.rootScope, this.scope)) return;
    const local = capabilities.materializeRemoteFile(relPath);
    if (local === null) return;
    void Promise.resolve(local).then((materialized) => {
      if (materialized === null) return;
      capabilities.openInEditor(materialized, line);
    });
  }

  // A `tabs` delivery: when the scoped workspace has gone away, abandon the scan and close the tab,
  // silently. The next open rebuilds the tab at the launch directory.
  checkScope(event: TabsNotification, capabilities: TabPluginServerCapabilities): void {
    if (!event.tabs.includes(INSTANCE_KEY)) return;
    if (!scopeGone(this.scope, event.data, capabilities)) return;
    this.cancel();
    capabilities.closeOwnTab(INSTANCE_KEY);
  }

  dispose(): void {
    this.cancel();
  }

  // One batch from the scan: rows to append, the scan having settled, or the scan having failed. The
  // tab is republished on every batch, which is what makes the table fill while a scan is still
  // running rather than only at the end. A failure replaces the rows rather than joining them — a
  // scan that could not finish reports why, and the partial results it did manage are still on
  // screen from the batches before it.
  private receive(rows: SearchMatch[], done: boolean, error?: string): void {
    if (error !== undefined) {
      this.payload = payloadOf(this.payload, { state: 'error', message: error });
      this.publish();
      return;
    }
    if (rows.length === 0 && !done) return;
    this.payload = payloadOf(this.payload, {
      rows: rows.length === 0 ? this.payload.rows : [...this.payload.rows, ...rows],
      state: done ? 'done' : this.payload.state,
    });
    this.publish();
  }

  // Every search carries all three modes, so this is where a toggle reaches the config. A failed
  // write is not reported: the toggles still work for this session, and nothing in the tab could fix
  // the file. It is retried by the next search that differs from what was last saved.
  private remember(request: SearchIntent): void {
    const modes = modesFrom(request);
    if (sameModes(modes, this.saved)) return;
    if (this.capabilities.saveSettings({ ...modes })) this.saved = modes;
  }

  private publish(): void {
    this.capabilities.updateTab(INSTANCE_KEY, () => ({ payload: this.payload }));
  }

  private cancel(): void {
    this.scan?.cancel();
    this.scan = null;
  }
}

;
