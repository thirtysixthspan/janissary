import { messageBus } from '../bus.js';
import { refreshGit } from './git-refresh.js';
import { watchDir, unwatchDir } from './watch.js';
import { pollForDir } from './poll.js';
import { writeCreatedPayload, writeRebuiltPayload } from './manager-payload.js';
import { invalidateDirectory } from './filesystem-cache.js';
import { closeFileNavigatorTabs } from './manager-close.js';
import { findOpenFilesTab, withFilesState } from './manager-state.js';
import type { Managers } from '../managers.js';
import type { FilesTabState } from './state.js';

const DEBOUNCE_MS = 100;

// Owns the file navigator tabs' shared state and the watch lifecycle every one of them runs on: one
// non-recursive `fs.watch` per visible directory, a single debounced rebuild per tab when one
// fires, the stat-cache invalidation that makes that rebuild re-read what changed, and the payload
// writes that redraw the tab. `FileNavigatorManager` adds navigation, mutations, openers and git sync
// on top; everything here is the part a tab needs before any of that is asked of it.
export class WatchedFilesTabs {
  protected readonly tabs = new Map<string, FilesTabState>();

  constructor(protected readonly managers: Managers) {}

  protected watchDir(label: string, absDir: string, relPath: string): void {
    watchDir(this.tabs, label, absDir, relPath, () => this.scheduleRebuild(label, relPath));
  }

  // Poll a not-yet-existing root until it's created, then build the tree for real and start
  // watching it — the tail end of what `openFilesCommand` does for a root that already exists.
  protected pollForCreation(label: string, absDir: string): void {
    pollForDir(this.tabs, label, absDir, () => this.onDirCreated(label, absDir));
  }

  protected unwatchDir(state: FilesTabState, relPath: string): void {
    unwatchDir(state, relPath);
  }

  protected refreshGit(label: string): void {
    refreshGit(this.tabs, label, (l) => this.rebuild(l));
  }

  // Rebuild the visible row list (pruning expanded directories that no longer exist) and write it
  // onto the tab's payload.
  protected rebuild(label: string): void {
    const found = findOpenFilesTab(this.managers, this.tabs, label);
    if (!found) return;
    const { state, tab } = found;
    writeRebuiltPayload(tab, state, () => this.rebuild(label));
    messageBus.emit('state', { type: 'dirty' });
  }

  // Tear down one tab's watchers and debounce timer (on tab close).
  closeTab(label: string): void {
    closeFileNavigatorTabs(this.managers, this.tabs, label);
  }

  // Tear down every tab's watchers (app shutdown).
  dispose(): void {
    for (const label of this.tabs.keys()) this.closeTab(label);
  }

  private onDirCreated(label: string, absDir: string): void {
    const found = findOpenFilesTab(this.managers, this.tabs, label);
    if (!found) return;
    const { state, tab } = found;
    writeCreatedPayload(tab, state, absDir, () => this.rebuild(label));
    this.watchDir(label, absDir, '');
    this.refreshGit(label);
    messageBus.emit('state', { type: 'dirty' });
  }

  private scheduleRebuild(label: string, relPath = ''): void {
    withFilesState(this.tabs, label, undefined, (state) => {
      if (state.debounce) clearTimeout(state.debounce);
      // The watcher fired, so every cached stat is suspect — empty the cache and let the rebuild
      // re-read only the rows that are actually visible.
      invalidateDirectory(state, relPath);
      state.debounce = setTimeout(() => { this.rebuild(label); this.refreshGit(label); }, DEBOUNCE_MS);
    });
  }
}
