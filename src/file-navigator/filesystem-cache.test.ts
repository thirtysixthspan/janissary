import { describe, it, expect, vi } from 'vitest';
import { buildCachedRows, clearFilesystemCache, pruneCachedRows } from './filesystem-cache.js';
import type { FilesTabState } from './state.js';
import type { FileNavigatorEntry } from './index.js';
import type { RowStat } from './stats.js';

// A tree whose reads never resolve on their own: every `readDirectory`/`statRows` call parks its
// resolver here, so a case can settle one at the exact moment it wants to. This is the shape a
// remote tree has — the local port answers synchronously and can never be caught mid-read.

type ParkedListing = { relPath: string; resolve: (entries: FileNavigatorEntry[]) => void };
type ParkedStats = { resolve: (stats: Record<string, RowStat | null>) => void };

function makeAsyncState(expanded: string[] = ['sub'], details: 'name' | 'size' = 'name'): {
  state: FilesTabState; listingReads: ParkedListing[]; statReads: ParkedStats[];
} {
  const listingReads: ParkedListing[] = [];
  const statReads: ParkedStats[] = [];
  const state = {
    root: '/remote/ws',
    filesystem: {
      readDirectory: (_root: string, relPath: string) =>
        new Promise<FileNavigatorEntry[]>((resolve) => { listingReads.push({ relPath, resolve }); }),
      statRows: () =>
        new Promise<Record<string, RowStat | null>>((resolve) => { statReads.push({ resolve }); }),
    },
    expanded: new Set<string>(expanded),
    watchers: new Map(),
    listings: new Map<string, FileNavigatorEntry[]>(),
    listingLoads: new Set<string>(),
    statLoads: new Set<string>(),
    cacheGeneration: 0,
    undoStack: [],
    redoStack: [],
    details,
    stats: new Map(),
  } as unknown as FilesTabState;
  return { state, listingReads, statReads };
}

// Two ticks: the read's own `then` and the assertion that follows it.
async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('clearFilesystemCache', () => {
  it('empties both caches, both in-flight markers, and moves the generation on', () => {
    const { state } = makeAsyncState();
    state.listings.set('', [{ name: 'sub', dir: true }]);
    state.stats.set('sub', null);
    state.listingLoads.add('sub');
    state.statLoads.add('sub');

    clearFilesystemCache(state);

    expect(state.listings.size).toBe(0);
    expect(state.stats.size).toBe(0);
    expect(state.listingLoads.size).toBe(0);
    expect(state.statLoads.size).toBe(0);
    expect(state.cacheGeneration).toBe(1);
  });

  it('discards a listing read that was already in flight, rather than caching what it read', async () => {
    const { state, listingReads } = makeAsyncState();
    const onReady = vi.fn();
    buildCachedRows(state, onReady);
    expect(listingReads).toHaveLength(1);

    clearFilesystemCache(state);
    listingReads[0].resolve([{ name: 'before-the-pull.txt', dir: false }]);
    await settle();

    expect(state.listings.has('')).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('discards a listing read that was in flight and failed', async () => {
    const { state } = makeAsyncState();
    const onReady = vi.fn();
    const failing = Promise.reject(new Error('connection lost'));
    state.filesystem.readDirectory = () => failing;
    buildCachedRows(state, onReady);

    clearFilesystemCache(state);
    await settle();

    expect(state.listings.has('')).toBe(false);
    expect(onReady).not.toHaveBeenCalled();
  });

  it('leaves the read issued after it free to complete, marker and all', async () => {
    const { state, listingReads } = makeAsyncState();
    const onReady = vi.fn();
    buildCachedRows(state, onReady);

    clearFilesystemCache(state);
    buildCachedRows(state, onReady);
    expect(listingReads).toHaveLength(2);
    // The stale read settles first: it must not take the fresh read's in-flight marker with it.
    listingReads[0].resolve([{ name: 'before-the-pull.txt', dir: false }]);
    await settle();
    expect(state.listingLoads.has('')).toBe(true);

    listingReads[1].resolve([{ name: 'after-the-pull.txt', dir: false }]);
    await settle();

    expect(state.listings.get('')).toEqual([{ name: 'after-the-pull.txt', dir: false }]);
    expect(state.listingLoads.has('')).toBe(false);
  });

  it('discards a stat batch that was already in flight', async () => {
    const { state, listingReads, statReads } = makeAsyncState([], 'size');
    const onReady = vi.fn();
    buildCachedRows(state, onReady);
    listingReads[0].resolve([{ name: 'notes.txt', dir: false }]);
    await settle();
    buildCachedRows(state, onReady);
    expect(statReads).toHaveLength(1);
    onReady.mockClear();

    clearFilesystemCache(state);
    statReads[0].resolve({ 'notes.txt': { size: 1, modified: 2, mode: 33_188 } });
    await settle();

    expect(state.stats.size).toBe(0);
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe('pruneCachedRows', () => {
  it('keeps an expanded directory whose parent listing has not loaded yet', () => {
    const { state } = makeAsyncState();
    state.listings.set('', [{ name: 'sub', dir: true }]);
    state.listings.set('sub', [{ name: 'old.txt', dir: false }]);
    expect(pruneCachedRows(state, () => {}).map((row) => row.path)).toContain('sub/old.txt');

    clearFilesystemCache(state);
    pruneCachedRows(state, () => {});

    expect([...state.expanded]).toEqual(['sub']);
  });

  it('prunes an expanded directory its loaded parent no longer lists, and stops its watcher', () => {
    const { state } = makeAsyncState();
    const stop = vi.fn();
    state.watchers.set('sub', { stop });
    state.listings.set('', [{ name: 'other', dir: true }]);

    pruneCachedRows(state, () => {});

    expect([...state.expanded]).toEqual([]);
    expect(stop).toHaveBeenCalled();
    expect(state.watchers.has('sub')).toBe(false);
  });

  it('keeps an expanded directory its loaded parent still lists', () => {
    const { state } = makeAsyncState();
    state.listings.set('', [{ name: 'sub', dir: true }]);
    state.listings.set('sub', []);

    pruneCachedRows(state, () => {});

    expect([...state.expanded]).toEqual(['sub']);
  });
});
