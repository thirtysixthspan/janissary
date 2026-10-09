import path from 'node:path';
import type { TabPluginServerCapabilities } from '../api.js';
import { isInsideRoot } from '../files.js';
import type { ChangeSetResult } from './change-set.js';
import { readChangeSet } from './change-set.js';
import { displayRoot } from './display.js';
import type { DiffPayload } from './shared.js';
// The state one diff tab holds between calls: which root it is showing and what it currently shows.
// Kept beside `activate.ts` because it is the plugin's whole lifetime — `dispose` has to reach it —
// while `activate.ts` is about wiring handlers. One tab at a time, addressed by one instance key, the
// way the search tab's `SearchSession` holds its query and rows.
const INSTANCE_KEY = 'diff';
const TAB_TITLE = 'diff';

// Where the route that opened the tab was standing: the launch directory every path resolves
// against, and the workspace clone when the opening tab has one.
export type DiffOrigin = { root: string; workspace?: { dir: string } };

function emptyPayload(): DiffPayload {
  return { root: '', state: 'done', message: '', files: [] };
}

function reasonOf(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split('\n').find((line) => line.trim().length > 0) ?? 'git diff failed';
}

function resultChanges(result: ChangeSetResult): Partial<DiffPayload> {
  switch (result.kind) {
    case 'not-repository': {
      return { state: 'not-repository', message: '', files: [] };
    }
    case 'error': {
      return { state: 'error', message: result.reason, files: [] };
    }
    default: {
      return { state: 'done', message: '', files: result.files };
    }
  }
}

export class DiffSession {
  private root = '';
  private hideWhitespace = true;
  private payload: DiffPayload = emptyPayload();
  private inFlight = false;
  private disposed = false;

  constructor(private capabilities: TabPluginServerCapabilities) {}

  // Open the tab on `root`, or focus the one already open. The factory runs only when the tab has to
  // be built, so a tab already showing another root is focused and then re-scoped here. A re-scope
  // publishes the cleared payload itself, because the recompute that follows paints only when it
  // lands; a root with nothing known yet shows nothing rather than another root's change set.
  open(root: string, origin: DiffOrigin): void {
    if (this.disposed || root === '') return;
    const rescope = root !== this.root;
    this.root = root;
    this.payload = {
      ...this.payload,
      root: displayRoot(root, origin.root, origin.workspace?.dir),
      ...(rescope && { state: 'loading', message: '', files: [] }),
    };
    this.capabilities.openOrFocusTab(INSTANCE_KEY, () => ({ title: TAB_TITLE, payload: this.payload }));
    if (rescope) this.safely({});
    void this.recompute();
  }

  // Recompute for the tab's current root. `hideWhitespace` travels with the request because it
  // changes which lines git reports, so the server holds no toggle state between calls. A recompute
  // already in flight is neither joined nor queued: the tab's own poll comes round again shortly.
  async refresh(hideWhitespace: boolean): Promise<void> {
    this.hideWhitespace = hideWhitespace;
    await this.recompute();
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
    try {
      const result = await readChangeSet(rootAtStart, this.hideWhitespace);
      if (!this.disposed && this.root === rootAtStart) this.safely(resultChanges(result));
    } catch (error) {
      this.safely({ state: 'error', message: reasonOf(error), files: [] });
    } finally {
      this.inFlight = false;
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
