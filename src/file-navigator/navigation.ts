import path from 'node:path';
import { containedPath } from './batch-paths.js';
import { parentPath } from './index.js';
import type { FilesTabState } from './state.js';

// The narrow slice of `FileNavigatorManager` internals this module needs, handed over as bound closures
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
  const absolute = relPath ? containedPath(state.root, relPath) : state.root;
  if (!absolute) return;
  if (state.expanded.has(relPath)) {
    state.expanded.delete(relPath);
    port.unwatchDir(state, relPath);
  } else {
    state.expanded.add(relPath);
    port.watchDir(label, absolute, relPath);
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
  const target = relPath === undefined
    ? path.resolve(state.root, '..')
    : relPath === '' || relPath === '.'
      ? state.root
      : containedPath(state.root, relPath);
  if (!target) return;
  if (target === state.root) return;
  for (const relPath2 of state.expanded) port.unwatchDir(state, relPath2);
  state.expanded.clear();
  port.unwatchDir(state, '');
  state.root = target;
  state.gitStatuses = new Map();
  state.branch = undefined;
  state.stats.clear();
  port.watchDir(label, target, '');
  if (port.hasTab(label)) port.setCwd(label, target);
  port.rebuild(label);
  port.refreshGit(label);
}

// Mark one directory expanded and start watching it, unless it already is. Shared with
// `restore.ts`, which replays a saved expanded set through the same pair of steps.
export function expandAndWatch(port: NavPort, label: string, state: FilesTabState, relPath: string): void {
  if (state.expanded.has(relPath)) return;
  const absolute = relPath ? containedPath(state.root, relPath) : state.root;
  if (!absolute) return;
  state.expanded.add(relPath);
  port.watchDir(label, absolute, relPath);
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
    expandAndWatch(port, label, state, cur);
  }
  port.rebuild(label);
}
