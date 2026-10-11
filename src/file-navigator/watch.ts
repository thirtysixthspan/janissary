import type { FilesTabState } from './state.js';

// The narrow slice of a files-tab's state this module touches — just its watcher map, so this
// stays decoupled from FileNavigatorManager's full FilesTabState (and avoids a circular import).
type WatchableState = Pick<FilesTabState, 'root' | 'filesystem' | 'watchers' | 'pendingWatchers'>;

// Starts a non-recursive `fs.watch` on `absDir` (keyed by `relPath` in `label`'s watcher map),
// invoking `onChange` on every event. A no-op if the tab is unknown or already watching that path.
// Exotic filesystems, fd limits, and races are swallowed — the tree still works, just refreshes on
// toggle instead of live.
export function watchDir(states: Map<string, WatchableState>, label: string, _absDir: string, relPath: string, onChange: () => void): void {
  const state = states.get(label);
  if (!state || state.watchers.has(relPath) || state.pendingWatchers.has(relPath)) return;
  const root = state.root;
  const request = Symbol(relPath);
  state.pendingWatchers.set(relPath, request);
  let result;
  try {
    result = state.filesystem.watch(root, relPath, onChange);
  } catch {
    if (state.pendingWatchers.get(relPath) === request) state.pendingWatchers.delete(relPath);
    return;
  }
  if (result instanceof Promise) {
    void result.then((handle) => {
      const ownsRequest = state.pendingWatchers.get(relPath) === request;
      if (ownsRequest) state.pendingWatchers.delete(relPath);
      if (ownsRequest && states.get(label) === state && state.root === root && !state.watchers.has(relPath)) {
        state.watchers.set(relPath, handle);
      } else handle.stop();
    }, () => {
      if (state.pendingWatchers.get(relPath) === request) state.pendingWatchers.delete(relPath);
      // A refused or unavailable remote watch leaves the tree manually refreshable.
    });
  } else {
    if (state.pendingWatchers.get(relPath) === request) {
      state.pendingWatchers.delete(relPath);
      state.watchers.set(relPath, result);
    } else result.stop();
  }
}

// Revokes an unresolved acquisition and stops the resolved watcher at `relPath`, if any.
export function unwatchDir(state: WatchableState, relPath: string): void {
  state.pendingWatchers.delete(relPath);
  const watcher = state.watchers.get(relPath);
  if (!watcher) return;
  watcher.stop();
  state.watchers.delete(relPath);
}

// Revoke all pending acquisitions and stop every resolved watcher during tab teardown.
export function unwatchAllDirs(state: WatchableState): void {
  const paths = new Set([...state.pendingWatchers.keys(), ...state.watchers.keys()]);
  for (const relPath of paths) unwatchDir(state, relPath);
}
