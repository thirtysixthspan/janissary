import type { FilesTabState } from './state.js';

// The narrow slice of a files-tab's state this module touches — just its watcher map, so this
// stays decoupled from FileNavigatorManager's full FilesTabState (and avoids a circular import).
type WatchableState = Pick<FilesTabState, 'root' | 'filesystem' | 'watchers'>;

// Starts a non-recursive `fs.watch` on `absDir` (keyed by `relPath` in `label`'s watcher map),
// invoking `onChange` on every event. A no-op if the tab is unknown or already watching that path.
// Exotic filesystems, fd limits, and races are swallowed — the tree still works, just refreshes on
// toggle instead of live.
export function watchDir(states: Map<string, WatchableState>, label: string, _absDir: string, relPath: string, onChange: () => void): void {
  const state = states.get(label);
  if (!state || state.watchers.has(relPath)) return;
  const result = state.filesystem.watch(state.root, relPath, onChange);
  if (result instanceof Promise) {
    void result.then((handle) => {
      if (states.get(label) === state && !state.watchers.has(relPath)) state.watchers.set(relPath, handle);
      else handle.stop();
    }, () => { /* a refused or unavailable remote watch leaves the tree manually refreshable */ });
  } else {
    state.watchers.set(relPath, result);
  }
}

// Stops and forgets the watcher at `relPath`, if any.
export function unwatchDir(state: WatchableState, relPath: string): void {
  const watcher = state.watchers.get(relPath);
  if (!watcher) return;
  watcher.stop();
  state.watchers.delete(relPath);
}
