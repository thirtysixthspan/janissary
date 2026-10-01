import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { markStats, readRowStat, type RowStat } from './stats.js';
import type { FileNavigatorDetail, FileNavigatorRow } from '../tab/types.js';

let roots: string[] = [];

function root(): string {
  const created = mkdtempSync(path.join(os.tmpdir(), 'janissary-stats-'));
  roots.push(created);
  return created;
}

const STAT: RowStat = { size: 5, modified: 1_700_000_000_000, mode: 0o10_0644 };

function state(details: FileNavigatorDetail, cached: Record<string, RowStat | null> = {}) {
  return { details, stats: new Map<string, RowStat | null>(Object.entries(cached)) };
}

function fileRow(name: string): FileNavigatorRow {
  return { path: name, name, depth: 0, dir: false };
}

afterEach(() => {
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
  roots = [];
});

describe('markStats', () => {
  it('returns the rows untouched in name mode', () => {
    const rows = [fileRow('a.txt')];
    expect(markStats(state('name', { 'a.txt': STAT }), rows)).toBe(rows);
  });

  it('attaches only the value the current mode needs', () => {
    const sized = markStats(state('size', { 'a.txt': STAT }), [fileRow('a.txt')])[0];
    expect(sized.size).toBe(5);
    expect(sized.modified).toBeUndefined();
    expect(sized.mode).toBeUndefined();

    const modified = markStats(state('modified', { 'a.txt': STAT }), [fileRow('a.txt')])[0];
    expect(modified.modified).toBe(STAT.modified);
    expect(modified.size).toBeUndefined();

    const permissions = markStats(state('permissions', { 'a.txt': STAT }), [fileRow('a.txt')])[0];
    expect(permissions.mode).toBe(STAT.mode);
    expect(permissions.size).toBeUndefined();
  });

  it('leaves directory rows and .. without a size', () => {
    const rows: FileNavigatorRow[] = [
      { path: '..', name: '..', depth: 0, dir: true },
      { path: 'sub', name: 'sub', depth: 0, dir: true },
    ];

    const marked = markStats(state('size', { '..': STAT, sub: STAT }), rows);
    expect(marked[0].size).toBeUndefined();
    expect(marked[1].size).toBeUndefined();
  });

  it('gives directory rows a mode in permissions mode', () => {
    const marked = markStats(state('permissions', { sub: STAT }), [{ path: 'sub', name: 'sub', depth: 0, dir: true }]);
    expect(marked[0].mode).toBe(STAT.mode);
  });

  it('leaves the fields absent for a cached miss', () => {
    const marked = markStats(state('size', { 'gone.txt': null }), [fileRow('gone.txt')]);
    expect(marked[0].size).toBeUndefined();
  });

  // Filling the cache is the filesystem port's job. A remote tree's row whose stat is still on its way
  // must not be described by whatever the local disk holds at the same relative path in the meantime.
  it('reads nothing from disk and caches nothing for a row whose stat has not arrived', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'hello');
    const tab = { ...state('size'), root: directory };

    const marked = markStats(tab, [fileRow('a.txt')]);

    expect(marked[0].size).toBeUndefined();
    expect(tab.stats.has('a.txt')).toBe(false);
  });
});

describe('readRowStat', () => {
  it('reads the three displayed values of a file', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'hello');
    const stat = readRowStat(path.join(directory, 'a.txt'));
    expect(stat?.size).toBe(5);
    expect(typeof stat?.modified).toBe('number');
    expect(typeof stat?.mode).toBe('number');
  });

  it('answers a miss, without throwing, when the path is gone', () => {
    expect(readRowStat(path.join(root(), 'gone.txt'))).toBeNull();
  });

  it('still describes a broken symlink, since lstat reads the link itself', () => {
    const directory = root();
    const target = path.join(directory, 'missing.txt');
    symlinkSync(target, path.join(directory, 'broken.txt'));

    expect(readRowStat(path.join(directory, 'broken.txt'))?.size).toBe(Buffer.byteLength(target));
  });

  it('describes the symlink itself rather than its target', () => {
    const directory = root();
    const target = path.join(directory, 'target.txt');
    writeFileSync(target, 'a much longer body than the link');
    symlinkSync(target, path.join(directory, 'link.txt'));

    expect(readRowStat(path.join(directory, 'link.txt'))?.size).toBe(Buffer.byteLength(target));
    expect(readRowStat(target)?.size).toBe('a much longer body than the link'.length);
  });
});
