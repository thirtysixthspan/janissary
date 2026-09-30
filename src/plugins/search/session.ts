import path from 'node:path';
import type { TabPluginServerCapabilities } from '../api.js';
import { isInsideRoot } from '../files.js';
import { startScan, type ScanHandle, type ScanRead } from './scan.js';
import { modesFrom, sameModes, type SearchModes } from './saved-modes.js';
import type { SearchIntent, SearchMatch, SearchPayload } from './shared.js';

const INSTANCE_KEY = 'search';
const TAB_TITLE = 'search';

export function emptyPayload(): SearchPayload {
  return {
    query: '', include: '', exclude: '',
    regex: false, matchCase: false, wholeWord: false,
    state: 'done', message: '', rows: [],
  };
}

function payloadOf(
  base: SearchPayload, changes: Partial<SearchPayload>,
): SearchPayload {
  return { ...base, ...changes };
}

// The state one search tab holds between calls: what it currently shows, and the scan still feeding
// it. Kept beside `activate.ts` rather than inside it because it is the plugin's whole lifetime —
// `dispose` has to reach the scan through it — and `activate.ts` is about wiring handlers.
//
// The rows accumulate here rather than being sent whole each time, so a batch arriving appends to
// what the tab already shows instead of replacing it. One scan is in flight at a time: a new query
// cancels the previous one, which is what keeps a superseded scan's rows off the screen.
export class SearchSession {
  private payload: SearchPayload;
  private scan: ScanHandle | null = null;
  private root = '';
  // The modes as last read from or written to the config, so a search that changes none of them
  // does not rewrite the file on every keystroke.
  private saved: SearchModes;

  constructor(
    private capabilities: TabPluginServerCapabilities,
    // Overridable so a test can supply file contents without a filesystem. Production always reads
    // the real file, which is the only route a result's text can come from — and because the
    // contents are already in hand when one is supplied, its size is the contents' own length.
    private contents?: ScanRead,
  ) {
    this.saved = modesFrom(capabilities.readSettings());
    this.payload = payloadOf(emptyPayload(), this.saved);
  }

  // Open the tab if it is not already open, or focus the one that is. A `search` command with an
  // argument seeds the query and starts a scan; a bare `search` just reveals the tab, so the chord
  // and the command both land the user in the same place with whatever they last searched for.
  open(argument: string): void {
    const query = argument.trim();
    this.capabilities.openOrFocusTab(INSTANCE_KEY, () => ({
      title: TAB_TITLE,
      payload: query === '' ? this.payload : { ...this.payload, query },
    }));
    if (query !== '') this.run({ ...this.payload, query });
  }

  // Start a scan for a query and its filters, replacing whatever the tab was showing. The tab is
  // repainted into the searching state immediately so the body reads `Searching…` before the first
  // row lands, and rows append as batches arrive. Only the query half of the payload is taken; the
  // rest is what this method produces.
  run(request: SearchIntent): void {
    this.remember(request);
    this.cancel();
    this.payload = payloadOf(this.payload, { ...request, state: 'searching', message: '', rows: [] });
    this.publish();
    const contents = this.contents;
    this.scan = startScan({
      listFiles: async () => {
        const listed = await this.capabilities.projectFileList();
        this.root = listed.root;
        return listed;
      },
      readFile: contents,
      fileSize: contents === undefined ? undefined : async (absPath) => {
        try {
          const text = await contents(absPath);
          return text.length;
        } catch {
          return null;
        }
      },
      onBatch: (batch) => this.receive(batch.rows, batch.done, batch.error),
    }, request);
  }

  // Put the file a result names on the line that result names, in an editor tab. The path arrived
  // from the client, and `path.join` collapses `..`, so it is resolved and checked against the
  // project root before it goes anywhere: a row's path is one the scan itself produced, and a
  // client that names anything else gets nothing.
  openMatch(relPath: string, line: number): void {
    const target = path.join(this.root, relPath);
    if (!isInsideRoot(this.root, target)) return;
    this.capabilities.openInEditor(target, line);
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

export { INSTANCE_KEY as SEARCH_INSTANCE_KEY };
