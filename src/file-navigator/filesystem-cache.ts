import path from 'node:path';
import { buildRows, parentPath } from './index.js';
import { markStats } from './stats.js';
import { unwatchDir } from './watch.js';
import type { FilesTabState } from './state.js';
import type { FileNavigatorRow } from '../tab/types.js';

function isPromise<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof (value as Promise<T>).then === 'function';
}

// A directory's entries from the tab's own filesystem, cached: the listing when it is known, or
// `undefined` while a read of it is still in flight — `onReady` fires once that read lands.
export function listingFor(
  state: FilesTabState,
  relPath: string,
  onReady: () => void,
) {
  if (state.listings.has(relPath)) return state.listings.get(relPath);
  if (state.listingLoads.has(relPath)) return;
  let result;
  try {
    result = state.filesystem.readDirectory(state.root, relPath);
  } catch {
    state.listings.set(relPath, []);
    return [];
  }
  if (!isPromise(result)) {
    state.listings.set(relPath, result);
    return result;
  }
  // A read that outlives its cache generation or request identity belongs to nobody: it cannot
  // restore invalidated contents or take the in-flight marker of the read that replaced it.
  const generation = state.cacheGeneration;
  const request = Symbol(relPath);
  state.listingLoads.set(relPath, request);
  void result.then((entries) => {
    if (state.cacheGeneration !== generation || state.listingLoads.get(relPath) !== request) return;
    state.listingLoads.delete(relPath);
    state.listings.set(relPath, entries);
    onReady();
  }, () => {
    if (state.cacheGeneration !== generation || state.listingLoads.get(relPath) !== request) return;
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
    for (const relPath of missing) state.stats.set(relPath, result[relPath] ?? null);
    return;
  }
  // Each row has its own request identity because a batch may span directories and only some rows
  // may have been invalidated — see `listingFor` for the listing equivalent.
  const generation = state.cacheGeneration;
  const requests = new Map(missing.map((relPath) => [relPath, Symbol(relPath)]));
  for (const [relPath, request] of requests) state.statLoads.set(relPath, request);
  void result.then((stats) => {
    if (state.cacheGeneration !== generation) return;
    let hasCurrentRows = false;
    for (const relPath of missing) {
      if (state.statLoads.get(relPath) !== requests.get(relPath)) continue;
      state.statLoads.delete(relPath);
      state.stats.set(relPath, stats[relPath] ?? null);
      hasCurrentRows = true;
    }
    if (hasCurrentRows) onReady();
  }, () => {
    if (state.cacheGeneration !== generation) return;
    for (const [relPath, request] of requests) {
      if (state.statLoads.get(relPath) === request) state.statLoads.delete(relPath);
    }
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
    unwatchDir(state, relPath);
  }
  return rows;
}

// Drop both caches and in-flight markers. The generation and request identities keep old reads from
// writing their results or taking markers belonging to replacement reads.
export function clearFilesystemCache(state: FilesTabState): void {
  state.cacheGeneration += 1;
  state.listings.clear();
  state.stats.clear();
  state.listingLoads.clear();
  state.statLoads.clear();
}

export function invalidateDirectory(state: FilesTabState, relPath: string): void {
  state.listings.delete(relPath);
  state.listingLoads.delete(relPath);
  for (const key of state.stats.keys()) {
    if (path.posix.dirname(key) !== (relPath || '.')) continue;
    state.stats.delete(key);
    state.statLoads.delete(key);
  }
  for (const key of state.statLoads.keys()) {
    if (path.posix.dirname(key) === (relPath || '.')) state.statLoads.delete(key);
  }
}
