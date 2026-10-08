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
  // be built, so a tab already showing another root is focused and then re-scoped here; the payload
  // the factory builds carries the new root's loading state, and the recompute repaints the tab
  // through `updateTab`.
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

  private async recompute(): Promise<void> {
    if (this.inFlight || this.disposed) return;
    this.inFlight = true;
    const rootAtStart = this.root;
    this.publish({ state: 'loading' });
    const result = await readChangeSet(rootAtStart, this.hideWhitespace);
    this.inFlight = false;
    // A recompute that started on another root, or one that finished after the plugin was disposed,
    // publishes nothing: the tab has moved on, or is gone.
    if (this.disposed || this.root !== rootAtStart) return;
    this.publish(resultChanges(result));
  }

  private publish(changes: Partial<DiffPayload>): void {
    this.payload = { ...this.payload, ...changes };
    this.capabilities.updateTab(INSTANCE_KEY, () => ({ payload: this.payload }));
  }
}
