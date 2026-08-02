import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { markStats, type RowStat } from './stats.js';
import type { FileNavigatorDetail, FileNavigatorRow } from '../tab/types.js';

let roots: string[] = [];

function root(): string {
  const created = mkdtempSync(path.join(os.tmpdir(), 'janissary-stats-'));
  roots.push(created);
  return created;
}

function state(treeRoot: string, details: FileNavigatorDetail) {
  return { root: treeRoot, details, stats: new Map<string, RowStat | null>() };
}

function fileRow(name: string): FileNavigatorRow {
  return { path: name, name, depth: 0, dir: false };
}

afterEach(() => {
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
  roots = [];
});

describe('markStats', () => {
  it('stats nothing and returns the rows untouched in name mode', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'hello');
    const tab = state(directory, 'name');
    const rows = [fileRow('a.txt')];

    expect(markStats(tab, rows)).toBe(rows);
    expect(tab.stats.size).toBe(0);
  });

  it('attaches only the value the current mode needs', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'hello');

    const sized = markStats(state(directory, 'size'), [fileRow('a.txt')])[0];
    expect(sized.size).toBe(5);
    expect(sized.modified).toBeUndefined();
    expect(sized.mode).toBeUndefined();

    const modified = markStats(state(directory, 'modified'), [fileRow('a.txt')])[0];
    expect(typeof modified.modified).toBe('number');
    expect(modified.size).toBeUndefined();

    const permissions = markStats(state(directory, 'permissions'), [fileRow('a.txt')])[0];
    expect(typeof permissions.mode).toBe('number');
    expect(permissions.size).toBeUndefined();
  });

  it('leaves directory rows and .. without a size', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'sub'));
    const rows: FileNavigatorRow[] = [
      { path: '..', name: '..', depth: 0, dir: true },
      { path: 'sub', name: 'sub', depth: 0, dir: true },
    ];

    const marked = markStats(state(directory, 'size'), rows);
    expect(marked[0].size).toBeUndefined();
    expect(marked[1].size).toBeUndefined();
  });

  it('gives directory rows a mode in permissions mode', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'sub'));
    const marked = markStats(state(directory, 'permissions'), [{ path: 'sub', name: 'sub', depth: 0, dir: true }]);
    expect(typeof marked[0].mode).toBe('number');
  });

  it('leaves the fields absent when the stat fails, without throwing', () => {
    const directory = root();
    const tab = state(directory, 'size');

    const marked = markStats(tab, [fileRow('gone.txt')]);
    expect(marked[0].size).toBeUndefined();
    expect(tab.stats.get('gone.txt')).toBeNull();
  });

  it('still describes a broken symlink, since lstat reads the link itself', () => {
    const directory = root();
    const target = path.join(directory, 'missing.txt');
    symlinkSync(target, path.join(directory, 'broken.txt'));

    const marked = markStats(state(directory, 'size'), [fileRow('broken.txt')]);
    expect(marked[0].size).toBe(Buffer.byteLength(target));
  });

  it('reads a cached path from the cache and re-stats once it is emptied', () => {
    const directory = root();
    const file = path.join(directory, 'a.txt');
    writeFileSync(file, 'hello');
    const tab = state(directory, 'size');

    expect(markStats(tab, [fileRow('a.txt')])[0].size).toBe(5);
    writeFileSync(file, 'hello there');
    expect(markStats(tab, [fileRow('a.txt')])[0].size).toBe(5);

    tab.stats.clear();
    expect(markStats(tab, [fileRow('a.txt')])[0].size).toBe(11);
  });

  it('describes the symlink itself rather than its target', () => {
    const directory = root();
    const target = path.join(directory, 'target.txt');
    writeFileSync(target, 'a much longer body than the link');
    symlinkSync(target, path.join(directory, 'link.txt'));

    const marked = markStats(state(directory, 'size'), [fileRow('link.txt'), fileRow('target.txt')]);
    expect(marked[0].size).toBe(Buffer.byteLength(target));
    expect(marked[1].size).toBe('a much longer body than the link'.length);
  });
});
