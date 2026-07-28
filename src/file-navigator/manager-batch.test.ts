import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { deleteMany, moveMany } from './manager-batch.js';
import type { MoveGroup } from './moves.js';

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

function state(directory: string): { root: string; undoStack: MoveGroup[]; redoStack: MoveGroup[] } {
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
    expect(result).toEqual({ total: 1, failedPaths: ['missing.txt'] });
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
    expect(result).toEqual({ total: 1, failedPaths: ['missing.txt'] });
    expect(rebuilt).toBe(0);
  });
});
