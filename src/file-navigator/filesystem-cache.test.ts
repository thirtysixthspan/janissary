import { describe, it, expect, vi } from 'vitest';
import { buildCachedRows, clearFilesystemCache, invalidateDirectory, pruneCachedRows } from './filesystem-cache.js';
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

// A tree whose reads answer on the spot, the way the local port does. The async state above is the
// remote shape; this is the other half, and it reaches different lines because nothing is parked.
function makeSyncState(entries: FileNavigatorEntry[], stats: Record<string, RowStat | null> = {}) {
  const readDirectory = vi.fn(() => entries);
  const statRows = vi.fn(() => stats);
  const state = {
    root: '/ws',
    filesystem: { readDirectory, statRows },
    expanded: new Set<string>(),
    watchers: new Map(),
    listings: new Map<string, FileNavigatorEntry[]>(),
    listingLoads: new Set<string>(),
    statLoads: new Set<string>(),
    cacheGeneration: 0,
    undoStack: [],
    redoStack: [],
    details: 'size' as const,
    stats: new Map<string, RowStat | null>(),
  } as unknown as FilesTabState;
  return { state, readDirectory, statRows };
}

describe('buildCachedRows on a synchronous tree', () => {
  const stat = { size: 12, modified: 2, mode: 33_188 };

  // With nothing missing there is nothing to ask, so no read is issued at all — a stat round trip
  // per rebuild would be the cost of redrawing a tree whose rows are already described.
  it('asks for no stats when every row already has one', () => {
    const { state, statRows } = makeSyncState([{ name: 'a.txt', dir: false }], { 'a.txt': stat });
    state.stats.set('a.txt', stat);

    buildCachedRows(state, () => {});

    expect(statRows).not.toHaveBeenCalled();
  });

  it('writes a synchronous stat batch straight into the cache', () => {
    const { state, statRows } = makeSyncState([{ name: 'a.txt', dir: false }], { 'a.txt': stat });

    const rows = buildCachedRows(state, () => {});

    expect(statRows).toHaveBeenCalledExactlyOnceWith('/ws', ['a.txt']);
    expect(state.stats.get('a.txt')).toEqual(stat);
    // Nothing was in flight, so nothing is left marked as loading.
    expect(state.statLoads.size).toBe(0);
    expect(rows.map((row) => row.path)).toEqual(['..', 'a.txt']);
  });

  it('caches a row the batch says nothing about as null', () => {
    const { state } = makeSyncState([{ name: 'a.txt', dir: false }], {});
    buildCachedRows(state, () => {});
    expect(state.stats.get('a.txt')).toBeNull();
  });

  it('leaves the tree alone when the details row is the name', () => {
    const { state, statRows } = makeSyncState([{ name: 'a.txt', dir: false }], { 'a.txt': stat });
    state.details = 'name';
    buildCachedRows(state, () => {});
    expect(statRows).not.toHaveBeenCalled();
  });
});

describe('buildCachedRows reading in flight', () => {
  // A redraw while a listing is still being read must not start a second read of the same path: the
  // in-flight marker stands for the read already under way, and a second would race it.
  it('starts no second read of a path already being read', () => {
    const { state, listingReads } = makeAsyncState();
    const onReady = vi.fn();
    buildCachedRows(state, onReady);
    expect(listingReads).toHaveLength(1);

    buildCachedRows(state, onReady);
    expect(listingReads).toHaveLength(1);

    listingReads[0].resolve([{ name: 'a.txt', dir: false }]);
    return settle();
  });

  // The stat batch is the same contract one level down: a row whose read is in flight is not asked
  // for again, so a rebuild mid-read cannot double the round trips.
  it('starts no second stat read of a row already being asked for', async () => {
    const { state, listingReads, statReads } = makeAsyncState([], 'size');
    const onReady = vi.fn();
    buildCachedRows(state, onReady);
    listingReads[0].resolve([{ name: 'a.txt', dir: false }]);
    await settle();
    // The stat pass only runs on a rebuild that can already see the rows.
    buildCachedRows(state, onReady);
    expect(statReads).toHaveLength(1);

    buildCachedRows(state, onReady);
    expect(statReads).toHaveLength(1);

    statReads[0].resolve({ 'a.txt': { size: 1, modified: 2, mode: 33_188 } });
    await settle();
  });
});

describe('buildCachedRows settling an asynchronous stat batch', () => {
  // A stat pass only runs on a rebuild that can see the rows, so the root listing is settled and the
  // tree drawn again before the batch under test even exists.
  const statPass = async (
    state: FilesTabState, listingReads: ParkedListing[], statReads: ParkedStats[], onReady: () => void,
  ) => {
    buildCachedRows(state, onReady);
    listingReads[0].resolve([{ name: 'a.txt', dir: false }]);
    await settle();
    buildCachedRows(state, onReady);
    await settle();
    return statReads;
  };

  it('writes the batch into the cache, frees its markers, and reports ready', async () => {
    const { state, listingReads, statReads } = makeAsyncState([], 'size');
    const onReady = vi.fn();

    expect(await statPass(state, listingReads, statReads, onReady)).toHaveLength(1);
    onReady.mockClear();

    statReads[0].resolve({ 'a.txt': { size: 1, modified: 2, mode: 33_188 } });
    await settle();

    expect(state.stats.get('a.txt')).toEqual({ size: 1, modified: 2, mode: 33_188 });
    expect(state.statLoads.size).toBe(0);
    expect(onReady).toHaveBeenCalled();
  });

  it('frees its markers and reports ready when the batch failed', async () => {
    const { state, listingReads, statReads } = makeAsyncState([], 'size');
    const onReady = vi.fn();
    await statPass(state, listingReads, statReads, onReady);
    // Free the parked batch's marker, then make the row missing again so a fresh read is issued.
    statReads[0].resolve({});
    await settle();
    state.stats.delete('a.txt');
    onReady.mockClear();

    // Rejected inside the call, so the handler the cache attaches lands in the same tick and the
    // rejection is never briefly unhandled.
    state.filesystem.statRows = () => Promise.reject(new Error('connection lost'));
    buildCachedRows(state, onReady);
    await settle();

    expect(state.statLoads.size).toBe(0);
    expect(onReady).toHaveBeenCalled();
  });

  // A stat read is discarded on a generation change for the same reason a listing read is: writing it
  // would put pre-invalidation contents into a cache emptied precisely to be rid of them.
  it('discards a batch that was in flight when the cache was cleared', async () => {
    const { state, listingReads, statReads } = makeAsyncState([], 'size');
    const onReady = vi.fn();
    await statPass(state, listingReads, statReads, onReady);
    expect(statReads).toHaveLength(1);

    clearFilesystemCache(state);
    onReady.mockClear();
    statReads[0].resolve({ 'a.txt': { size: 1, modified: 2, mode: 33_188 } });
    await settle();

    expect(state.stats.size).toBe(0);
    expect(onReady).not.toHaveBeenCalled();
  });
});

describe('a read that fails at the current generation', () => {
  // A failure is not a reason to leave the tree blank: the listing caches as empty so the rows below
  // it still draw, the in-flight marker is freed so a later rebuild can ask again, and ready is
  // reported so the rebuild that triggered it actually happens.
  it('caches a failed listing as empty, frees its marker, and reports ready', async () => {
    const { state } = makeAsyncState();
    const onReady = vi.fn();
    // Rejected inside the call, so the handler the cache attaches lands in the same tick.
    state.filesystem.readDirectory = () => Promise.reject(new Error('connection lost'));

    buildCachedRows(state, onReady);
    await settle();

    expect(state.listings.get('')).toEqual([]);
    expect(state.listingLoads.size).toBe(0);
    expect(onReady).toHaveBeenCalled();
  });
});

describe('invalidateDirectory', () => {
  const stat = { size: 1, modified: 2, mode: 33_188 };

  it('drops the directory listing and the stats of the rows directly inside it', () => {
    const { state } = makeAsyncState();
    state.listings.set('src', [{ name: 'a.ts', dir: false }]);
    state.stats.set('src/a.ts', stat);
    state.stats.set('src/deep/b.ts', stat);
    state.stats.set('docs/c.md', null);

    invalidateDirectory(state, 'src');

    expect(state.listings.has('src')).toBe(false);
    expect(state.stats.has('src/a.ts')).toBe(false);
    // A row further down is not invalidated with its parent: the parent listing is what changed, and
    // the nested one has its own.
    expect(state.stats.has('src/deep/b.ts')).toBe(true);
    expect(state.stats.has('docs/c.md')).toBe(true);
  });

  it('treats the tree root as the directory holding every top-level row', () => {
    const { state } = makeAsyncState();
    state.stats.set('a.ts', stat);
    state.stats.set('sub/b.ts', stat);

    invalidateDirectory(state, '');

    expect(state.stats.has('a.ts')).toBe(false);
    expect(state.stats.has('sub/b.ts')).toBe(true);
  });
});

describe('a stat batch that fails after the cache was cleared', () => {
  // The rejection side of the generation guard, which the fulfilment side already covers: a batch
  // that failed must be discarded exactly as one that succeeded would be, or it frees the in-flight
  // marker of the read that replaced it and the row looks asked-for when nothing ever answered.
  it('is discarded rather than freeing the marker of the read that replaced it', async () => {
    const { state, listingReads } = makeAsyncState([], 'size');
    const onReady = vi.fn();
    buildCachedRows(state, onReady);
    listingReads[0].resolve([{ name: 'a.txt', dir: false }]);
    await settle();

    // From here every stat read is one that fails, so the rejection is the case under test.
    state.filesystem.statRows = () => Promise.reject(new Error('connection lost'));
    buildCachedRows(state, onReady);
    await settle();
    expect(state.statLoads.size).toBe(0);

    // Ask again, then empty the cache underneath the read before it settles.
    state.filesystem.statRows = () => Promise.reject(new Error('connection lost again'));
    state.stats.clear();
    buildCachedRows(state, onReady);
    expect(state.statLoads.has('a.txt')).toBe(true);

    clearFilesystemCache(state);
    onReady.mockClear();
    await settle();

    expect(state.stats.size).toBe(0);
    expect(onReady).not.toHaveBeenCalled();
  });
});
