import path from 'node:path';
import { buildRows, parentPath } from './index.js';
import { markStats } from './stats.js';
import type { FilesTabState } from './state.js';
import type { FileNavigatorRow } from '../tab/types.js';

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>).then === 'function';
}

function listingFor(
  state: FilesTabState,
  relPath: string,
  onReady: () => void,
) {
  if (state.listings.has(relPath)) return state.listings.get(relPath);
  if (state.listingLoads.has(relPath)) return;
  const result = state.filesystem.readDirectory(state.root, relPath);
  if (!isPromise(result)) {
    state.listings.set(relPath, result);
    return result;
  }
  // A read that outlives the cache it was started for belongs to nobody: writing its entries would
  // put pre-invalidation contents into a cache that was emptied precisely to be rid of them, and
  // deleting its in-flight marker would take the marker of the read that replaced it.
  const generation = state.cacheGeneration;
  state.listingLoads.add(relPath);
  void result.then((entries) => {
    if (state.cacheGeneration !== generation) return;
    state.listingLoads.delete(relPath);
    state.listings.set(relPath, entries);
    onReady();
  }, () => {
    if (state.cacheGeneration !== generation) return;
    state.listingLoads.delete(relPath);
    state.listings.set(relPath, []);
    onReady();
  });
  return;
}

function fillStats(state: FilesTabState, rows: FileNavigatorRow[], onReady: () => void): void {
  if (state.details === 'name') return;
  const missing = rows
    .filter((row) => row.path !== '..' && !state.stats.has(row.path) && !state.statLoads.has(row.path))
    .map((row) => row.path);
  if (missing.length === 0) return;
  const result = state.filesystem.statRows(state.root, missing);
  if (!isPromise(result)) {
    for (const [relPath, stat] of Object.entries(result)) state.stats.set(relPath, stat);
    return;
  }
  // Discarded on a generation change for the same reason a listing read is — see `listingFor`.
  const generation = state.cacheGeneration;
  for (const relPath of missing) state.statLoads.add(relPath);
  void result.then((stats) => {
    if (state.cacheGeneration !== generation) return;
    for (const relPath of missing) {
      state.statLoads.delete(relPath);
      state.stats.set(relPath, stats[relPath] ?? null);
    }
    onReady();
  }, () => {
    if (state.cacheGeneration !== generation) return;
    for (const relPath of missing) state.statLoads.delete(relPath);
    onReady();
  });
}

export function buildCachedRows(state: FilesTabState, onReady: () => void): FileNavigatorRow[] {
  let rows = buildRows(
    state.root,
    state.expanded,
    (_absolute, relPath) => listingFor(state, relPath, onReady),
  );
  if (state.remoteRoot === state.root) rows = rows.filter((row) => row.path !== '..');
  fillStats(state, rows, onReady);
  return markStats(state, rows);
}

// A directory missing from the rows just built has only gone from disk if those rows were built
// from a listing that actually says so — which is why an expanded path is dropped only once its
// parent's listing is in the cache. On a tree whose reads are synchronous every visible listing
// arrives during this same build, so nothing is ever deferred; on one whose reads are not, the rows
// are momentarily empty after the cache is dropped, and reading that as "everything was deleted"
// would collapse the whole tree and stop its watchers. The rebuild each arriving listing triggers
// prunes what really did go.
export function pruneCachedRows(state: FilesTabState, onReady: () => void): FileNavigatorRow[] {
  const rows = buildCachedRows(state, onReady);
  const directories = new Set(rows.filter((row) => row.dir).map((row) => row.path));
  for (const relPath of state.expanded) {
    if (directories.has(relPath) || !state.listings.has(parentPath(relPath))) continue;
    state.expanded.delete(relPath);
    state.watchers.get(relPath)?.stop();
    state.watchers.delete(relPath);
  }
  return rows;
}

// Drop everything this tab has cached about the filesystem: both caches, both in-flight markers,
// and — through the generation — the reads those markers stood for, so a read issued before this
// call can neither write its contents afterwards nor take the marker of the read that replaces it.
export function clearFilesystemCache(state: FilesTabState): void {
  state.cacheGeneration += 1;
  state.listings.clear();
  state.stats.clear();
  state.listingLoads.clear();
  state.statLoads.clear();
}

export function invalidateDirectory(state: FilesTabState, relPath: string): void {
  state.listings.delete(relPath);
  for (const key of state.stats.keys()) {
    if (path.posix.dirname(key) === (relPath || '.')) state.stats.delete(key);
  }
}
