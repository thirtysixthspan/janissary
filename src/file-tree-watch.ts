import { watch, type FSWatcher } from 'node:fs';

// The narrow slice of a files-tab's state this module touches — just its watcher map, so this
// stays decoupled from FileTreeManager's full FilesTabState (and avoids a circular import).
type WatchableState = { watchers: Map<string, FSWatcher> };

// Starts a non-recursive `fs.watch` on `absDir` (keyed by `relPath` in `label`'s watcher map),
// invoking `onChange` on every event. A no-op if the tab is unknown or already watching that path.
// Exotic filesystems, fd limits, and races are swallowed — the tree still works, just refreshes on
// toggle instead of live.
export function watchDir(states: Map<string, WatchableState>, label: string, absDir: string, relPath: string, onChange: () => void): void {
  const state = states.get(label);
  if (!state || state.watchers.has(relPath)) return;
  try {
    state.watchers.set(relPath, watch(absDir, onChange));
  } catch {
    // Exotic filesystems, fd limits, races — the tree still works, just refreshes on toggle.
  }
}

// Stops and forgets the watcher at `relPath`, if any.
export function unwatchDir(state: WatchableState, relPath: string): void {
  const watcher = state.watchers.get(relPath);
  if (!watcher) return;
  try { watcher.close(); } catch { /* already gone */ }
  state.watchers.delete(relPath);
}
