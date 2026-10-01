import { describe, expect, it, vi } from 'vitest';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { restoreTreeView } from './restore.js';
import type { NavPort } from './navigation.js';
import type { FilesTabState } from './state.js';
import type { FileNavigatorEntry } from './index.js';

type ParkedListing = { relPath: string; resolve: (entries: FileNavigatorEntry[]) => void };

// A remote tree: every listing parks until the case settles it, and a stat or watch is never asked
// for by the restore itself. Rooted at a real local directory that has a `src` of its own, so a
// restore that consulted the local disk instead of the tab's port would be caught believing it.
function remoteNavigator() {
  const localTwin = mkdtempSync(path.join(tmpdir(), 'janus-restore-'));
  mkdirSync(path.join(localTwin, 'src'));
  const listingReads: ParkedListing[] = [];
  const state = {
    root: localTwin,
    filesystem: {
      readDirectory: (_root: string, relPath: string) =>
        new Promise<FileNavigatorEntry[]>((resolve) => { listingReads.push({ relPath, resolve }); }),
      statRows: () => Promise.resolve({}),
    },
    expanded: new Set<string>(),
    watchers: new Map(),
    listings: new Map<string, FileNavigatorEntry[]>(),
    listingLoads: new Set<string>(),
    statLoads: new Set<string>(),
    cacheGeneration: 0,
    details: 'name',
    stats: new Map(),
  } as unknown as FilesTabState;
  const port = {
    states: new Map([['files', state]]),
    watchDir: vi.fn(),
    rebuild: vi.fn(),
  } as unknown as NavPort;
  return { state, port, listingReads };
}

describe('restoreTreeView on a tree whose listings are asynchronous', () => {
  it('asks the tab\'s own port about a saved directory rather than the local disk', () => {
    const { state, port, listingReads } = remoteNavigator();

    restoreTreeView(port, 'files', { expanded: ['src'] });

    expect(listingReads.map((read) => read.relPath)).toContain('');
    // Still loading, so it is expanded on trust; the listing's arrival decides whether it stays.
    expect(state.expanded.has('src')).toBe(true);
  });

  it('rebuilds once the parent listing arrives, so a vanished saved directory can be pruned', async () => {
    const { port, listingReads } = remoteNavigator();
    restoreTreeView(port, 'files', { expanded: ['src'] });
    vi.mocked(port.rebuild).mockClear();

    listingReads.find((read) => read.relPath === '')?.resolve([{ name: 'README.md', dir: false }]);
    await Promise.resolve();
    await Promise.resolve();

    expect(port.rebuild).toHaveBeenCalledWith('files');
  });

  it('keeps no selection hint for a row the remote tree has not listed yet', () => {
    const { state, port } = remoteNavigator();

    restoreTreeView(port, 'files', { cursor: 'src', selected: ['src'] });

    expect(state.restore).toMatchObject({ cursor: undefined, selected: [] });
  });
});
