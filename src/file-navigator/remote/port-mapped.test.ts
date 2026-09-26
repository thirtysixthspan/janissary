import { describe, expect, it, vi } from 'vitest';
import { RemotePortPaths } from './port-paths.js';
import { remoteReplay, remoteSearch, remoteStatRows } from './port-mapped.js';
import type { HistoryStep } from '../moves.js';

// The far side speaks workspace-relative paths, so every path an operation names crosses the mapper
// here — out in the request, and back in the answer. These tests hold the mapper to exactly that.
function pathsFor(workspace: string) {
  return new RemotePortPaths(Promise.resolve(workspace));
}

const step = (from: string, to: string): HistoryStep => ({ entries: [{ from, to }] });

describe('remoteSearch', () => {
  // A search names no path: the far side searches the workspace root it provisioned, so its matches
  // come back workspace-relative and have to be re-rooted onto the navigator's own tree.
  it('re-roots the far side\'s workspace-relative matches onto the navigator root', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ['src/a.ts', 'src/lib/b.ts', 'docs/c.ts']);
    expect(await remoteSearch(request, paths, '/ws/src')).toEqual(['a.ts', 'lib/b.ts']);
    expect(request).toHaveBeenCalledWith('search', {});
  });

  it('keeps the matches as they stand when the navigator is rooted at the workspace', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ['src/a.ts', 'docs/c.ts']);
    expect(await remoteSearch(request, paths, '/ws')).toEqual(['src/a.ts', 'docs/c.ts']);
  });
});

describe('remoteReplay', () => {
  // Both histories cross the mapper on the way out and again on the way back, so the answer the
  // server replays against is in the caller's own terms however the far side chose to name things.
  it('maps both stacks out to the remote and the answer back to the caller', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({
      undoStack: [step('src/a.ts', 'src/b.ts')],
      redoStack: [step('src/b.ts', 'src/a.ts')],
    }));
    const result = await remoteReplay(
      request, paths, '/ws/src', [step('a.ts', 'b.ts')], [step('b.ts', 'a.ts')],
      'undo', true, false,
    );

    expect(request).toHaveBeenCalledWith('replay', expect.objectContaining({
      undoStack: [step('src/a.ts', 'src/b.ts')],
      redoStack: [step('src/b.ts', 'src/a.ts')],
    }));
    expect(result.undoStack).toEqual([step('a.ts', 'b.ts')]);
    expect(result.redoStack).toEqual([step('b.ts', 'a.ts')]);
  });

  // A replay answers with the stacks as they stand, so the flags that decide how it is applied have
  // to arrive with the request rather than being implied by the caller's own history.
  it('passes the direction and both conflict flags through with the request', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({ undoStack: [], redoStack: [] }));
    await remoteReplay(request, paths, '/ws', [], [], 'redo', true, true);
    expect(request).toHaveBeenCalledWith('replay', expect.objectContaining({
      direction: 'redo', overwrite: true, skipConflicts: true,
    }));
  });

  it('answers with the empty stacks it was given when nothing is replayable', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({ undoStack: [], redoStack: [] }));
    const result = await remoteReplay(request, paths, '/ws', [], [], 'undo', false, false);
    expect(result).toEqual({ undoStack: [], redoStack: [] });
  });

  // Paste history carries absolute paths because a clipboard source can cross roots, so a paste
  // group crosses the mapper as the opaque step it is rather than being rewritten leg by leg.
  it('carries a paste group across unrewritten', async () => {
    const paths = pathsFor('/ws');
    const group: HistoryStep = { mode: 'copy', pairs: [{ source: '/elsewhere/a.ts', destination: 'a.ts' }] };
    const request = vi.fn(async () => ({ undoStack: [], redoStack: [group] }));
    const result = await remoteReplay(request, paths, '/ws/src', [group], [], 'undo', false, false);
    expect(request).toHaveBeenCalledWith('replay', expect.objectContaining({ undoStack: [group] }));
    expect(result.redoStack).toEqual([group]);
  });
});

describe('remoteSearch result shape', () => {
  it('returns a list even when the far side found nothing', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => []);
    const result: string[] = await remoteSearch(request, paths, '/ws/src');
    expect(result).toEqual([]);
  });
});

// The one status per row the tree draws, answered under the path the caller asked with rather than
// the one the far side named it by — the rows the client holds are the caller's spelling.
describe('remoteStatRows', () => {
  const a = { size: 1, modified: 2, mode: 3 };

  it('asks about each row by its remote path and keys the answer by the caller\'s path', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({ 'src/a.ts': a, 'src/b.ts': { ...a, size: 9 } }));
    const result = await remoteStatRows(request, paths, '/ws/src', ['a.ts', 'b.ts']);

    expect(request).toHaveBeenCalledWith('stat', { paths: ['src/a.ts', 'src/b.ts'] });
    expect(result).toEqual({ 'a.ts': a, 'b.ts': { ...a, size: 9 } });
  });

  // A path the far side did not answer is a miss, not a hole: the tree renders it as a leaf the
  // file is no longer there for, rather than dropping the row and shifting every row below it.
  it('answers null for a row the far side says nothing about', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({ 'src/a.ts': a }));
    const result = await remoteStatRows(request, paths, '/ws/src', ['a.ts', 'gone.ts']);
    expect(result).toEqual({ 'a.ts': a, 'gone.ts': null });
  });

  it('answers an empty map for no rows at all', async () => {
    const paths = pathsFor('/ws');
    const request = vi.fn(async () => ({}));
    expect(await remoteStatRows(request, paths, '/ws/src', [])).toEqual({});
    expect(request).toHaveBeenCalledWith('stat', { paths: [] });
  });
});
