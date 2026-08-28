import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { deleteBatch, moveBatch, normalizeBatchSources } from './batch.js';

let roots: string[] = [];

function root(): string {
  const created = mkdtempSync(path.join(os.tmpdir(), 'janissary-batch-'));
  roots.push(created);
  return created;
}

afterEach(() => {
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
  roots = [];
});

describe('file navigator batches', () => {
  it('normalizes duplicates and nested paths in input order', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dir'));
    writeFileSync(path.join(directory, 'dir', 'a.txt'), 'a');
    writeFileSync(path.join(directory, 'z.txt'), 'z');
    expect(normalizeBatchSources(directory, ['z.txt', 'dir', 'dir/a.txt', 'z.txt']).map((source) => source.rel))
      .toEqual(['z.txt', 'dir']);
  });

  it('reports invalid, absolute, traversal, and missing sources as failures', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    const result = moveBatch(directory, ['', '.', '..', '/tmp/a', '../a', 'missing'], 'dest');
    expect(result).toMatchObject({
      total: 6,
      failedPaths: ['', '.', '..', '/tmp/a', '../a', 'missing'],
      moved: [],
      mutated: false,
    });
    expect('failureReasons' in result && result.failureReasons?.missing)
      .toContain('no longer exists');
  });

  it('removes same-parent no-ops from the total', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    expect(moveBatch(directory, ['a.txt'], '')).toEqual({
      total: 0,
      failedPaths: [],
      moved: [],
      mutated: false,
    });
  });

  it('preflights every conflict without mutating any source', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'new a');
    writeFileSync(path.join(directory, 'b.txt'), 'new b');
    writeFileSync(path.join(directory, 'dest', 'a.txt'), 'old a');
    writeFileSync(path.join(directory, 'dest', 'b.txt'), 'old b');
    expect(moveBatch(directory, ['a.txt', 'b.txt'], 'dest')).toEqual({ conflictPaths: ['a.txt', 'b.txt'] });
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(true);
    expect(existsSync(path.join(directory, 'b.txt'))).toBe(true);
  });

  it('skips conflicts and moves distinct sources', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'new a');
    writeFileSync(path.join(directory, 'b.txt'), 'new b');
    writeFileSync(path.join(directory, 'dest', 'a.txt'), 'old a');
    const result = moveBatch(directory, ['a.txt', 'b.txt'], 'dest', 'skip-conflicts');
    expect(result).toMatchObject({ total: 2, failedPaths: [], mutated: true });
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(true);
    expect(readFileSync(path.join(directory, 'dest', 'b.txt'), 'utf8')).toBe('new b');
  });

  it('safely overwrites files and non-empty directories', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'source'));
    mkdirSync(path.join(directory, 'source', 'folder'));
    mkdirSync(path.join(directory, 'dest'));
    mkdirSync(path.join(directory, 'dest', 'folder'));
    writeFileSync(path.join(directory, 'source', 'folder', 'new.txt'), 'new');
    writeFileSync(path.join(directory, 'dest', 'folder', 'old.txt'), 'old');
    const result = moveBatch(directory, ['source/folder'], 'dest', 'overwrite-all');
    expect(result).toMatchObject({ total: 1, failedPaths: [], mutated: true });
    expect(existsSync(path.join(directory, 'dest', 'folder', 'new.txt'))).toBe(true);
    expect(existsSync(path.join(directory, 'dest', 'folder', 'old.txt'))).toBe(false);
  });

  it('fails every source in a duplicate basename group and continues', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'one'));
    mkdirSync(path.join(directory, 'two'));
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'one', 'a.txt'), 'one');
    writeFileSync(path.join(directory, 'two', 'a.txt'), 'two');
    writeFileSync(path.join(directory, 'b.txt'), 'b');
    const result = moveBatch(directory, ['one/a.txt', 'two/a.txt', 'b.txt'], 'dest');
    expect(result).toMatchObject({ total: 3, failedPaths: ['one/a.txt', 'two/a.txt'] });
    expect(existsSync(path.join(directory, 'dest', 'b.txt'))).toBe(true);
  });

  it('rejects moving a directory into its descendant', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dir', 'nested'), { recursive: true });
    expect(moveBatch(directory, ['dir'], 'dir/nested')).toMatchObject({
      total: 1,
      failedPaths: ['dir'],
      mutated: false,
    });
  });

  it('deletes valid sources after failures and preserves failure order', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    writeFileSync(path.join(directory, 'b.txt'), 'b');
    const result = deleteBatch(directory, ['missing-a', 'a.txt', 'missing-b', 'b.txt']);
    expect(result).toMatchObject({
      total: 4,
      failedPaths: ['missing-a', 'missing-b'],
      mutated: true,
    });
    expect(result.failureReasons?.['missing-a']).toContain('no longer exists');
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(false);
    expect(existsSync(path.join(directory, 'b.txt'))).toBe(false);
  });
});
