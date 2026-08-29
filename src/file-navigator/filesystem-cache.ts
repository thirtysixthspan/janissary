import path from 'node:path';
import { buildRows } from './index.js';
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
  state.listingLoads.add(relPath);
  void result.then((entries) => {
    state.listingLoads.delete(relPath);
    state.listings.set(relPath, entries);
    onReady();
  }, () => {
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
  for (const relPath of missing) state.statLoads.add(relPath);
  void result.then((stats) => {
    for (const relPath of missing) {
      state.statLoads.delete(relPath);
      state.stats.set(relPath, stats[relPath] ?? null);
    }
    onReady();
  }, () => {
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

export function pruneCachedRows(state: FilesTabState, onReady: () => void): FileNavigatorRow[] {
  const rows = buildCachedRows(state, onReady);
  const directories = new Set(rows.filter((row) => row.dir).map((row) => row.path));
  for (const relPath of state.expanded) {
    if (directories.has(relPath)) continue;
    state.expanded.delete(relPath);
    state.watchers.get(relPath)?.stop();
    state.watchers.delete(relPath);
  }
  return rows;
}

export function clearFilesystemCache(state: FilesTabState): void {
  state.listings.clear();
  state.stats.clear();
}

export function invalidateDirectory(state: FilesTabState, relPath: string): void {
  state.listings.delete(relPath);
  for (const key of state.stats.keys()) {
    if (path.posix.dirname(key) === (relPath || '.')) state.stats.delete(key);
  }
}
