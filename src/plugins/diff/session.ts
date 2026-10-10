import path from 'node:path';
import type { TabPluginServerCapabilities } from '../api.js';
import { isInsideRoot } from '../files.js';
import type { ChangeSetResult } from './change-set.js';
import { readChangeSet } from './change-set.js';
import { displayRoot } from './display.js';
import type { DiffFile, DiffPayload } from './shared.js';
import { preserveContextErrors } from './context-results.js';
// The state one diff tab holds between calls: which root it is showing and what it currently shows.
// Kept beside `activate.ts` because it is the plugin's whole lifetime — `dispose` has to reach it —
// while `activate.ts` is about wiring handlers. One tab at a time, addressed by one instance key, the
// way the search tab's `SearchSession` holds its query and rows.
const INSTANCE_KEY = 'diff';
const TAB_TITLE = 'diff';

// Where the route that opened the tab was standing: the launch directory every path resolves
// against, and the workspace clone when the opening tab has one.
export type DiffOrigin = { root: string; workspace?: { dir: string } };

function emptyPayload(split = false): DiffPayload {
  return { root: '', state: 'done', message: '', split, files: [] };
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n').find((line) => line.trim().length > 0) ?? 'git diff failed';
}

function resultChanges(result: ChangeSetResult, previous: DiffFile[]): Partial<DiffPayload> {
  switch (result.kind) {
    case 'not-repository': {
      return { state: 'not-repository', message: '', files: [] };
    }
    case 'error': {
      return { state: 'error', message: result.reason, files: [] };
    }
    default: {
      return { state: 'done', message: '', files: preserveContextErrors(result.files, previous) };
    }
  }
}

export class DiffSession {
  private root = '';
  // The layout as last read from or written to the settings entry, so a session that never changes
  // it does not rewrite the config, and a write the file refused is retried by the next change.
  private split = false;
  private savedSplit = false;
  private payload: DiffPayload = emptyPayload();
  private inFlight = false;
  private disposed = false;
  private fullFiles = new Set<string>();
  private revision = 0;

  constructor(private capabilities: TabPluginServerCapabilities) {
    const saved = capabilities.readSettings().split;
    if (typeof saved === 'boolean') {
      this.split = saved;
      this.savedSplit = saved;
    }
    this.payload = emptyPayload(this.split);
  }

  // Open the tab on `root`, or focus the one already open. The factory runs only when the tab has to
  // be built, so a tab already showing another root is focused and then re-scoped here. A re-scope
  // publishes the cleared payload itself, because the recompute that follows paints only when it
  // lands; a root with nothing known yet shows nothing rather than another root's change set.
  open(root: string, origin: DiffOrigin): void {
    if (this.disposed || root === '') return;
    const rescope = root !== this.root;
    if (rescope) { this.fullFiles.clear(); this.revision++; }
    this.root = root;
    this.payload = {
      ...this.payload,
      root: displayRoot(root, origin.root, origin.workspace?.dir),
      ...(rescope && { state: 'loading', message: '', files: [] }),
    };
    this.capabilities.openOrFocusTab(INSTANCE_KEY, () => {
      this.fullFiles.clear();
      this.revision++;
      this.payload = { ...emptyPayload(this.split), root: this.payload.root, state: 'loading' };
      return { title: TAB_TITLE, payload: this.payload };
    });
    if (rescope) this.safely({});
    void this.recompute();
  }

  // Recompute for the tab's current root. A recompute already in flight is neither joined nor
  // queued: the tab's own poll comes round again shortly.
  async refresh(): Promise<void> {
    await this.recompute();
  }

  // The layout the user chose, remembered in this plugin's settings entry so every diff tab after
  // this one opens with it. A choice already saved writes nothing: the layout is a standing
  // preference rather than something a repaint rewrites, and a write the file refused is retried by
  // the next change. The repaint is what switches the layout on screen.
  layout(split: boolean): void {
    this.split = split;
    if (split !== this.savedSplit && this.capabilities.saveSettings({ split })) this.savedSplit = split;
    this.safely({ split });
  }

  setFullFile(path: string, fullFile: boolean): void {
    const file = this.payload.files.find((candidate) => candidate.path === path);
    if (!file || file.binary || file.added || file.deleted || file.hunks.length === 0) {
      this.capabilities.rejectRequest('Cannot expand context for a file outside the current text diff.');
      return;
    }
    if (file.expandingContext) return;
    if (fullFile) this.fullFiles.add(path);
    else this.fullFiles.delete(path);
    this.revision++;
    this.safely({ files: this.payload.files.map((candidate) => candidate.path === path
      ? { ...candidate, expandingContext: true, contextError: '' } : candidate) });
    void this.recompute();
  }

  // Open a file at a line in an editor tab, through the same containment check the search tab's
  // `openMatch` makes: a path the diff never produced gets nothing.
  openFile(relPath: string, line: number): void {
    const absolute = path.join(this.root, relPath);
    if (!isInsideRoot(this.root, absolute)) return;
    this.capabilities.openInEditor(absolute, line);
  }

  // Open a binary file in the media tab its extension already opens, by offering the application's
  // own `open` line for its absolute path to the ordinary dispatcher.
  openMedia(relPath: string): void {
    const absolute = path.join(this.root, relPath);
    if (!isInsideRoot(this.root, absolute)) return;
    void this.capabilities.dispatchLineWithOutput(`open ${absolute}`);
  }

  dispose(): void {
    this.disposed = true;
  }

  // Nothing this method does may escape. The intent that asks for a recompute answers immediately
  // and leaves it running, so a throw here would be an unhandled rejection — and an unhandled
  // rejection takes the process down, which would close every tab in the application rather than
  // this one. Every failure the git layer can answer is already a result; this catches the one that
  // is not, and answers it as the tab's error state.
  //
  // A recompute paints the tab when its result lands, never when it starts: the payload already
  // published stands until the answer replaces it, so the once-a-second poll never blanks the body.
  private async recompute(): Promise<void> {
    if (this.inFlight || this.disposed) return;
    this.inFlight = true;
    const rootAtStart = this.root;
    const revisionAtStart = this.revision;
    const fullFiles = new Set(this.fullFiles);
    try {
      const result = await readChangeSet(rootAtStart, fullFiles);
      if (!this.disposed && this.root === rootAtStart && this.revision === revisionAtStart) this.safely(resultChanges(result, this.payload.files));
    } catch (error) {
      if (!this.disposed && this.revision === revisionAtStart) this.safely({ state: 'error', message: reasonOf(error), files: [] });
    } finally {
      this.inFlight = false;
      if (!this.disposed && this.revision !== revisionAtStart) void this.recompute();
    }
  }

  private publish(changes: Partial<DiffPayload>): void {
    this.payload = { ...this.payload, ...changes };
    this.capabilities.updateTab(INSTANCE_KEY, () => ({ payload: this.payload }));
  }

  // A publish the host refuses — a payload it will not accept — leaves nothing to answer with: the
  // tab is already gone as far as the application is concerned. Swallow it here rather than let it
  // climb out of a call nothing is awaiting.
  private safely(changes: Partial<DiffPayload>): void {
    try {
      this.publish(changes);
    } catch {
      // Deliberately empty.
    }
  }
}
