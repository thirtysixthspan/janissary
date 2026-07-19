import path from 'node:path';
import { parentPath } from './index.js';
import type { FilesTabState } from './manager.js';

// The narrow slice of `FileTreeManager` internals this module needs, handed over as bound closures
// so the tab-state map and watcher plumbing stay private to the manager (see `navPort()` there).
export interface NavPort {
  states: Map<string, FilesTabState>;
  watchDir(label: string, absDir: string, relPath: string): void;
  unwatchDir(state: FilesTabState, relPath: string): void;
  rebuild(label: string): void;
  refreshGit(label: string): void;
  setCwd(label: string, dir: string): void;
  hasTab(label: string): boolean;
}

// Expand/collapse one directory row.
export function toggleDir(port: NavPort, label: string, relPath: string): void {
  const state = port.states.get(label);
  if (!state) return;
  if (state.expanded.has(relPath)) {
    state.expanded.delete(relPath);
    port.unwatchDir(state, relPath);
  } else {
    state.expanded.add(relPath);
    port.watchDir(label, path.join(state.root, relPath), relPath);
  }
  port.rebuild(label);
}

// Collapse every expanded directory back to just the root.
export function collapseAllDirs(port: NavPort, label: string): void {
  const state = port.states.get(label);
  if (!state) return;
  for (const relPath of state.expanded) port.unwatchDir(state, relPath);
  state.expanded.clear();
  port.rebuild(label);
}

// Re-root the tree to the parent directory. Clears expanded state and watchers, then rebuilds.
export function rerootTree(port: NavPort, label: string, relPath?: string): void {
  const state = port.states.get(label);
  if (!state) return;
  const target = relPath ? path.resolve(state.root, relPath) : path.resolve(state.root, '..');
  if (target === state.root) return;
  for (const relPath2 of state.expanded) port.unwatchDir(state, relPath2);
  state.expanded.clear();
  port.unwatchDir(state, '');
  state.root = target;
  state.gitStatuses = new Map();
  state.branch = undefined;
  port.watchDir(label, target, '');
  if (port.hasTab(label)) port.setCwd(label, target);
  port.rebuild(label);
  port.refreshGit(label);
}

// Expand every ancestor directory of `relPath` not already expanded (adding to `expanded`,
// watching each newly-expanded one), then rebuild — the search pop-up's Enter action, so the
// target row exists in the client's next `rows` update for it to select and scroll to.
export function revealPath(port: NavPort, label: string, relPath: string): void {
  const state = port.states.get(label);
  if (!state) return;
  const dir = parentPath(relPath);
  const segments = dir ? dir.split('/') : [];
  let cur = '';
  for (const segment of segments) {
    cur = cur ? `${cur}/${segment}` : segment;
    if (state.expanded.has(cur)) continue;
    state.expanded.add(cur);
    port.watchDir(label, path.join(state.root, cur), cur);
  }
  port.rebuild(label);
}
