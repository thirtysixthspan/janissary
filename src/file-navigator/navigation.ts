import path from 'node:path';
import { abbreviateWorkspaceDir } from '../paths.js';
import { containedPath } from './batch-paths.js';
import { parentPath } from './index.js';
import type { FilesTabState } from './state.js';
import type { BasePort, NavigationPort } from './port.js';
import type { FileNavigatorEntry } from './index.js';
import { clearFilesystemCache } from './filesystem-cache.js';

// The narrow slice of `FileNavigatorManager` internals this module needs, handed over as bound closures
// so the tab-state map and watcher plumbing stay private to the manager (see `navPort()` there).
export type NavPort = NavigationPort;

// The member set the re-root sequence needs. Both the navigation port and the open port satisfy it
// structurally — the latter through the `setCwd`/`hasTab` closures it already carries on its
// managers — and the command path assembles one from its own callbacks.
export type ReRootPort = Pick<
  NavigationPort, 'unwatchDir' | 'watchDir' | 'setCwd' | 'rebuild' | 'refreshGit' | 'hasTab'
>;

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>).then === 'function';
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

// Stop watching every directory a tab has expanded, and forget that it had. The root's own watcher
// is not touched here: a caller that is about to watch a different root unwatches that separately,
// while collapsing in place leaves the root being watched.
//
// The expanded set is cleared along with the watchers because a stale entry would claim a row the
// tree no longer shows, and the tree is rebuilt from that set.
export function dropExpandedWatchers(port: Pick<BasePort, 'unwatchDir'>, state: FilesTabState): void {
  for (const relPath of state.expanded) port.unwatchDir(state, relPath);
  state.expanded.clear();
}

// The whole re-root sequence, in one place so the paths that re-root cannot drift over any half of
// it: drop every expanded watcher, unwatch the root, move the root, clear the git half — the
// statuses, the branch and the flag that says metadata has loaded — so a refresh is required rather
// than the previous root's answers staying on screen, clear the filesystem cache, re-watch, move the
// tab's cwd, rebuild, and refresh git.
//
// `entries` is the new root's listing when the caller already read it, which is what puts content in
// the tree the moment it rebuilds; a caller with no read lets the rebuild do that work. `label` is
// the tab's, and a tab that has since closed is left without a cwd.
export function reRootTree(
  port: ReRootPort, label: string, state: FilesTabState, root: string, entries?: FileNavigatorEntry[],
): void {
  dropExpandedWatchers(port, state);
  port.unwatchDir(state, '');
  state.root = root;
  state.gitStatuses = new Map();
  state.branch = undefined;
  state.gitMetadataLoaded = false;
  clearFilesystemCache(state);
  if (entries) state.listings.set('', entries);
  port.watchDir(label, root, '');
  if (port.hasTab(label)) port.setCwd(label, root);
  port.rebuild(label);
  port.refreshGit(label);
}

// Collapse every expanded directory back to just the root.
export function collapseAllDirs(port: NavPort, label: string): void {
  const state = port.states.get(label);
  if (!state) return;
  dropExpandedWatchers(port, state);
  port.rebuild(label);
}

// Re-root the tree to the parent directory. Clears expanded state and watchers, then rebuilds.
// Resolves the target and runs the remote escape check here; the sequence itself is `reRootTree`,
// which the remote paths share.
export function rerootTree(port: NavPort, label: string, relPath?: string): void {
  const state = port.states.get(label);
  if (!state) return;
  const previousRoot = state.root;
  const target = relPath === undefined
    ? path.resolve(state.root, '..')
    : relPath === '' || relPath === '.'
      ? state.root
      : containedPath(state.root, relPath);
  if (!target) return;
  if (state.remoteRoot) {
    const relative = path.relative(path.resolve(state.remoteRoot), target);
    if (relative && !containedPath(state.remoteRoot, relative)) {
      port.reportFailure(label, target, new Error(`outside the remote workspace ${abbreviateWorkspaceDir(state.remoteRoot)}`));
      return;
    }
  }
  if (target === state.root) return;
  // The new root is read first, so the tree has its listing the moment it rebuilds. A read that
  // lands after another re-root has already moved the root is dropped rather than written into the
  // newer one's cache.
  const apply = (entries: FileNavigatorEntry[]) => {
    if (state.root !== previousRoot) return;
    reRootTree(port, label, state, target, entries);
  };
  const failed = (error: unknown) => port.reportFailure(label, target, error);
  try {
    const entries = state.filesystem.readDirectory(target, '');
    if (isPromise(entries)) void entries.then(apply, failed);
    else apply(entries);
  } catch (error) {
    failed(error);
  }
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
