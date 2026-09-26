import { describe, expect, it, vi } from 'vitest';
import { RemotePortPaths } from './port-paths.js';
import { remoteMoveMany } from './port-moves.js';
import type { MoveManyResult } from '../batch.js';

// The far side answers with workspace-relative paths, including in a conflict report, so every path
// it names has to be mapped back onto the tree's root before the answer leaves this module.
function pathsFor(workspace: string) {
  return new RemotePortPaths(Promise.resolve(workspace));
}

const answering = (result: MoveManyResult) => vi.fn(async () => result);

describe('remoteMoveMany', () => {
  it('asks about every source and the destination by their remote paths, with the policy', async () => {
    const paths = pathsFor('/ws');
    const request = answering({ total: 2, failedPaths: [], moved: [], mutated: false });
    await remoteMoveMany(request, paths, '/ws/src', ['a.ts', 'b.ts'], 'dest', 'overwrite-all');
    expect(request).toHaveBeenCalledWith('move-many', {
      sources: ['src/a.ts', 'src/b.ts'], destination: 'src/dest', policy: 'overwrite-all',
    });
  });

  // A conflict is reported in the far side's spelling; the client is holding the caller's rows, so
  // an unmapped conflictPaths would name files the user cannot see.
  it('maps a conflict report back onto the tree', async () => {
    const paths = pathsFor('/ws');
    const request = answering({ conflictPaths: ['src/dest/a.ts', 'src/dest/b.ts'] });
    expect(await remoteMoveMany(request, paths, '/ws/src', ['a.ts', 'b.ts'], 'dest'))
      .toEqual({ conflictPaths: ['dest/a.ts', 'dest/b.ts'] });
  });

  it('maps the moved pairs and the failed paths back, and leaves the counts alone', async () => {
    const paths = pathsFor('/ws');
    const request = answering({
      total: 2,
      failedPaths: ['src/gone.ts'],
      failureReasons: { 'src/gone.ts': 'no such file' },
      moved: [{ from: 'src/a.ts', to: 'src/dest/a.ts' }],
      mutated: true,
    });
    const result = await remoteMoveMany(request, paths, '/ws/src', ['a.ts', 'gone.ts'], 'dest');

    expect(result).toEqual({
      total: 2,
      failedPaths: ['gone.ts'],
      failureReasons: { 'src/gone.ts': 'no such file' },
      moved: [{ from: 'a.ts', to: 'dest/a.ts' }],
      mutated: true,
    });
  });

  // Nothing moved and nothing failed: still a well-formed answer, with the stacks the tree redraws from.
  it('answers an empty move without inventing paths', async () => {
    const paths = pathsFor('/ws');
    const request = answering({ total: 0, failedPaths: [], moved: [], mutated: false });
    expect(await remoteMoveMany(request, paths, '/ws/src', [], 'dest'))
      .toEqual({ total: 0, failedPaths: [], moved: [], mutated: false });
  });

  it('carries no policy when the caller named none', async () => {
    const paths = pathsFor('/ws');
    const request = answering({ total: 0, failedPaths: [], moved: [], mutated: false });
    await remoteMoveMany(request, paths, '/ws', ['a.ts'], 'dest');
    expect(request).toHaveBeenCalledWith('move-many', {
      sources: ['a.ts'], destination: 'dest', policy: undefined,
    });
  });
});
