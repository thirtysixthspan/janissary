import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { deleteMany, moveMany, pasteMany } from './manager-batch.js';
import type { HistoryStep } from './moves.js';

let roots: string[] = [];

function root(): string {
  const created = mkdtempSync(path.join(os.tmpdir(), 'janissary-manager-batch-'));
  roots.push(created);
  return created;
}

afterEach(() => {
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
  roots = [];
});

function state(directory: string): { root: string; undoStack: HistoryStep[]; redoStack: HistoryStep[] } {
  return { root: directory, undoStack: [], redoStack: [] };
}

describe('moveMany', () => {
  it('records an undo entry, clears redo, and rebuilds on a successful move', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    const current = state(directory);
    current.redoStack.push({ entries: [{ from: 'old', to: 'older' }] });
    let rebuilt = 0;
    const result = moveMany(current, ['a.txt'], 'dest', undefined, () => { rebuilt += 1; });
    expect(result).toEqual({ total: 1, failedPaths: [] });
    expect(existsSync(path.join(directory, 'dest', 'a.txt'))).toBe(true);
    expect(current.undoStack).toEqual([{ entries: [{ from: 'a.txt', to: 'dest/a.txt' }] }]);
    expect(current.redoStack).toEqual([]);
    expect(rebuilt).toBe(1);
  });

  it('passes conflicts straight through without touching the undo stack or rebuilding', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'new a');
    writeFileSync(path.join(directory, 'dest', 'a.txt'), 'old a');
    const current = state(directory);
    let rebuilt = 0;
    const result = moveMany(current, ['a.txt'], 'dest', undefined, () => { rebuilt += 1; });
    expect(result).toEqual({ conflictPaths: ['a.txt'] });
    expect(current.undoStack).toEqual([]);
    expect(rebuilt).toBe(0);
  });

  it('does not rebuild or push an undo entry when nothing moved', () => {
    const directory = root();
    const current = state(directory);
    let rebuilt = 0;
    const result = moveMany(current, ['missing.txt'], 'dest', undefined, () => { rebuilt += 1; });
    expect(result).toMatchObject({ total: 1, failedPaths: ['missing.txt'] });
    expect('failureReasons' in result && result.failureReasons?.['missing.txt'])
      .toContain('destination is unavailable');
    expect(current.undoStack).toEqual([]);
    expect(rebuilt).toBe(0);
  });
});

describe('deleteMany', () => {
  it('deletes valid sources and rebuilds', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    const current = state(directory);
    let rebuilt = 0;
    const result = deleteMany(current, ['a.txt'], () => { rebuilt += 1; });
    expect(result).toEqual({ total: 1, failedPaths: [] });
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(false);
    expect(rebuilt).toBe(1);
  });

  it('does not rebuild when every source fails to delete', () => {
    const directory = root();
    const current = state(directory);
    let rebuilt = 0;
    const result = deleteMany(current, ['missing.txt'], () => { rebuilt += 1; });
    expect(result).toMatchObject({ total: 1, failedPaths: ['missing.txt'] });
    expect(result.failureReasons?.['missing.txt']).toContain('no longer exists');
    expect(rebuilt).toBe(0);
  });
});

describe('pasteMany', () => {
  it('refuses clipboard sources from a different host without touching the filesystem', () => {
    const directory = root();
    const current = { ...state(directory), remote: { host: 'devbox', address: 'devbox' } };
    const result = pasteMany(
      current, ['/other/a.txt'], '', 'copy', undefined, () => {}, 'other',
    );
    expect(result).toMatchObject({ total: 1, failedPaths: ['/other/a.txt'] });
    expect('failureReasons' in result && result.failureReasons?.['/other/a.txt'])
      .toContain('different host');
  });

  it('pushes one history step, clears redo, and rebuilds when something changed', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    const current = state(directory);
    current.redoStack.push({ entries: [{ from: 'old', to: 'older' }] });
    let rebuilt = 0;
    const result = pasteMany(
      current, [path.join(directory, 'a.txt')], 'dest', 'copy', undefined, () => { rebuilt += 1; },
    );
    expect(result).toEqual({ total: 1, failedPaths: [] });
    expect(current.undoStack).toEqual([
      { mode: 'copy', pairs: [{ from: path.join(directory, 'a.txt'), to: path.join(directory, 'dest', 'a.txt') }] },
    ]);
    expect(current.redoStack).toEqual([]);
    expect(rebuilt).toBe(1);
  });

  it('does not rebuild or push a step when nothing pasted', () => {
    const directory = root();
    const current = state(directory);
    let rebuilt = 0;
    const result = pasteMany(
      current, [path.join(directory, 'missing.txt')], '', 'copy', undefined, () => { rebuilt += 1; },
    );
    expect(result).toMatchObject({ total: 1, failedPaths: [path.join(directory, 'missing.txt')] });
    expect('failureReasons' in result
      && result.failureReasons?.[path.join(directory, 'missing.txt')])
      .toContain('no longer exists');
    expect(current.undoStack).toEqual([]);
    expect(rebuilt).toBe(0);
  });

  it('passes conflicts straight through without touching the undo stack', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'new');
    writeFileSync(path.join(directory, 'dest', 'a.txt'), 'old');
    const current = state(directory);
    const result = pasteMany(
      current, [path.join(directory, 'a.txt')], 'dest', 'copy', undefined, () => {},
    );
    expect(result).toEqual({ conflictPaths: [path.join(directory, 'a.txt')] });
    expect(current.undoStack).toEqual([]);
  });
});
