import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { deleteItem, moveItem, moveReplacingDestination, renameItem } from './filesystem.js';

let roots: string[] = [];

function root(): string {
  const created = mkdtempSync(path.join(os.tmpdir(), 'janissary-filesystem-'));
  roots.push(created);
  return created;
}

afterEach(() => {
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
  roots = [];
});

describe('moveReplacingDestination', () => {
  it('renames directly when the destination does not exist', () => {
    const directory = root();
    const source = path.join(directory, 'a.txt');
    const destination = path.join(directory, 'b.txt');
    writeFileSync(source, 'a');
    expect(moveReplacingDestination(source, destination)).toBe(true);
    expect(existsSync(source)).toBe(false);
    expect(readFileSync(destination, 'utf8')).toBe('a');
  });

  it('backs up and replaces an existing destination, then removes the backup', () => {
    const directory = root();
    const source = path.join(directory, 'a.txt');
    const destination = path.join(directory, 'b.txt');
    writeFileSync(source, 'new');
    writeFileSync(destination, 'old');
    expect(moveReplacingDestination(source, destination)).toBe(true);
    expect(existsSync(source)).toBe(false);
    expect(readFileSync(destination, 'utf8')).toBe('new');
    const entries = readdirSync(directory);
    expect(entries.filter((name) => name.includes('.janissary-'))).toEqual([]);
  });

  it('restores the backup and returns false when the source move fails', () => {
    const directory = root();
    const source = path.join(directory, 'missing.txt');
    const destination = path.join(directory, 'b.txt');
    writeFileSync(destination, 'old');
    expect(moveReplacingDestination(source, destination)).toBe(false);
    expect(readFileSync(destination, 'utf8')).toBe('old');
  });
});

describe('moveItem', () => {
  it('moves a file into a subdirectory and reports the new relative path', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    const result = moveItem(directory, 'a.txt', 'dest');
    expect(result).toEqual({ from: 'a.txt', to: 'dest/a.txt' });
    expect(existsSync(path.join(directory, 'dest', 'a.txt'))).toBe(true);
  });

  it('moves a file to the root and reports just the name', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'sub'));
    writeFileSync(path.join(directory, 'sub', 'a.txt'), 'a');
    const result = moveItem(directory, 'sub/a.txt', '');
    expect(result).toEqual({ from: 'sub/a.txt', to: 'a.txt' });
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(true);
  });

  it('returns undefined when the source does not exist', () => {
    const directory = root();
    const result = moveItem(directory, 'missing.txt', 'dest');
    expect(result).toBeUndefined();
  });
});

describe('renameItem', () => {
  it('renames a file in place and returns the old and new absolute paths', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    const result = renameItem(directory, 'a.txt', 'b.txt');
    expect(result).toEqual([path.join(directory, 'a.txt'), path.join(directory, 'b.txt')]);
    expect(existsSync(path.join(directory, 'b.txt'))).toBe(true);
  });

  it('rejects a new name containing a path separator', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    expect(renameItem(directory, 'a.txt', 'sub/b.txt')).toBeUndefined();
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(true);
  });

  it('returns undefined when the rename fails', () => {
    const directory = root();
    expect(renameItem(directory, 'missing.txt', 'b.txt')).toBeUndefined();
  });
});

describe('deleteItem', () => {
  it('deletes an existing file', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    expect(deleteItem(directory, 'a.txt')).toBe(true);
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(false);
  });

  it('returns false when the path does not exist', () => {
    const directory = root();
    expect(deleteItem(directory, 'missing.txt')).toBe(false);
  });
});
