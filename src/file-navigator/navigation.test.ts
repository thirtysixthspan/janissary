import { describe, expect, it, vi } from 'vitest';
import { collapseTree, rerootTree } from './navigation.js';
import type { FilesTabState } from './state.js';

function remoteState(root: string): FilesTabState {
  return {
    root,
    remoteRoot: '/remote/workspace',
    filesystem: { readDirectory: () => [] } as unknown as FilesTabState['filesystem'],
    expanded: new Set(),
    watchers: new Map(), pendingWatchers: new Map(),
    listings: new Map(),
    listingLoads: new Map(),
    statLoads: new Map(),
    cacheGeneration: 0,
    undoStack: [],
    redoStack: [],
    details: 'name',
    stats: new Map(),
  };
}

function navigationPort(state: FilesTabState) {
  return {
    states: new Map([['files', state]]),
    watchDir: vi.fn(),
    unwatchDir: vi.fn(),
    rebuild: vi.fn(),
    refreshGit: vi.fn(),
    reportFailure: vi.fn(),
    setCwd: vi.fn(),
    hasTab: () => true,
  };
}

describe('rerootTree for remote workspaces', () => {
  it('allows returning from a nested directory to the workspace root', () => {
    const state = remoteState('/remote/workspace/src');
    const port = navigationPort(state);

    rerootTree(port, 'files');

    expect(state.root).toBe('/remote/workspace');
    expect(port.reportFailure).not.toHaveBeenCalled();
    expect(port.setCwd).toHaveBeenCalledWith('files', '/remote/workspace');
  });

  it('refuses to move above the workspace root', () => {
    const state = remoteState('/remote/workspace');
    const port = navigationPort(state);

    rerootTree(port, 'files');

    expect(state.root).toBe('/remote/workspace');
    expect(port.reportFailure).toHaveBeenCalledWith(
      'files', '/remote', expect.objectContaining({ message: 'outside the remote workspace $workspace/workspace' }),
    );
  });
});

describe('collapseTree', () => {
  it('removes an expanded directory and its expanded descendants and unwatches each', () => {
    const state = remoteState('/remote/workspace');
    state.expanded = new Set(['src', 'src/deep', 'docs']);
    const port = navigationPort(state);

    collapseTree(port, state, 'src');

    expect(state.expanded).toEqual(new Set(['docs']));
    expect(port.unwatchDir.mock.calls.map(([, path]) => path)).toEqual(['src', 'src/deep']);
  });

  it('collapses every expanded directory at the tree root', () => {
    const state = remoteState('/remote/workspace');
    state.expanded = new Set(['src', 'src/deep', 'docs']);
    const port = navigationPort(state);

    collapseTree(port, state, '');

    expect(state.expanded).toEqual(new Set());
    expect(port.unwatchDir).toHaveBeenCalledTimes(3);
  });
});
