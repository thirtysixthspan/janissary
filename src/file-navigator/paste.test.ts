import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pasteBatch } from './paste.js';

let roots: string[] = [];

function root(): string {
  const created = mkdtempSync(path.join(os.tmpdir(), 'janissary-paste-'));
  roots.push(created);
  return created;
}

afterEach(() => {
  for (const directory of roots) rmSync(directory, { recursive: true, force: true });
  roots = [];
});

describe('pasteBatch — copy', () => {
  it('copies into a sibling directory, leaving the source in place', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    const result = pasteBatch(directory, [path.join(directory, 'a.txt')], 'dest', 'copy');
    expect(result).toEqual({
      total: 1,
      failedPaths: [],
      pairs: [{ from: path.join(directory, 'a.txt'), to: path.join(directory, 'dest', 'a.txt') }],
      mutated: true,
    });
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(true);
    expect(readFileSync(path.join(directory, 'dest', 'a.txt'), 'utf8')).toBe('a');
  });

  it('copying into the source\'s own directory produces a -2 duplicate and leaves the original', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    const result = pasteBatch(directory, [path.join(directory, 'a.txt')], '', 'copy');
    expect(result).toMatchObject({ total: 1, failedPaths: [] });
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(true);
    expect(existsSync(path.join(directory, 'a-2.txt'))).toBe(true);
  });

  it('copies a directory recursively', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'src'));
    writeFileSync(path.join(directory, 'src', 'x.txt'), 'x');
    mkdirSync(path.join(directory, 'dest'));
    const result = pasteBatch(directory, [path.join(directory, 'src')], 'dest', 'copy');
    expect(result).toMatchObject({ total: 1, failedPaths: [] });
    expect(readFileSync(path.join(directory, 'dest', 'src', 'x.txt'), 'utf8')).toBe('x');
  });
});

describe('pasteBatch — cut', () => {
  it('moves rather than copies', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    const result = pasteBatch(directory, [path.join(directory, 'a.txt')], 'dest', 'cut');
    expect(result).toMatchObject({ total: 1, failedPaths: [] });
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(false);
    expect(existsSync(path.join(directory, 'dest', 'a.txt'))).toBe(true);
  });

  it('pasting a cut back into its own directory is a silent no-op', () => {
    const directory = root();
    writeFileSync(path.join(directory, 'a.txt'), 'a');
    const result = pasteBatch(directory, [path.join(directory, 'a.txt')], '', 'cut');
    expect(result).toEqual({ total: 0, failedPaths: [], pairs: [], mutated: false });
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(true);
  });
});

describe('pasteBatch — conflicts', () => {
  it('preflights a conflict and returns conflictPaths without a policy', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'new');
    writeFileSync(path.join(directory, 'dest', 'a.txt'), 'old');
    const result = pasteBatch(directory, [path.join(directory, 'a.txt')], 'dest', 'copy');
    expect(result).toEqual({ conflictPaths: [path.join(directory, 'a.txt')] });
    expect(readFileSync(path.join(directory, 'dest', 'a.txt'), 'utf8')).toBe('old');
  });

  it('honors overwrite-all', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'new');
    writeFileSync(path.join(directory, 'dest', 'a.txt'), 'old');
    const result = pasteBatch(directory, [path.join(directory, 'a.txt')], 'dest', 'copy', 'overwrite-all');
    expect(result).toMatchObject({ total: 1, failedPaths: [] });
    expect(readFileSync(path.join(directory, 'dest', 'a.txt'), 'utf8')).toBe('new');
  });

  it('honors skip-conflicts', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    writeFileSync(path.join(directory, 'a.txt'), 'new a');
    writeFileSync(path.join(directory, 'dest', 'a.txt'), 'old a');
    writeFileSync(path.join(directory, 'b.txt'), 'b');
    const result = pasteBatch(
      directory,
      [path.join(directory, 'a.txt'), path.join(directory, 'b.txt')],
      'dest',
      'copy',
      'skip-conflicts',
    );
    expect(result).toMatchObject({ total: 2, failedPaths: [] });
    expect(readFileSync(path.join(directory, 'dest', 'a.txt'), 'utf8')).toBe('old a');
    expect(readFileSync(path.join(directory, 'dest', 'b.txt'), 'utf8')).toBe('b');
  });
});

describe('pasteBatch — failures', () => {
  it('a vanished source counts as a failure', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'dest'));
    const result = pasteBatch(directory, [path.join(directory, 'missing.txt')], 'dest', 'copy');
    expect(result).toEqual({
      total: 1,
      failedPaths: [path.join(directory, 'missing.txt')],
      pairs: [],
      mutated: false,
    });
  });

  it('a destination inside the copied directory itself is a failure', () => {
    const directory = root();
    mkdirSync(path.join(directory, 'src', 'inner'), { recursive: true });
    const result = pasteBatch(directory, [path.join(directory, 'src')], 'src/inner', 'copy');
    expect(result).toEqual({
      total: 1,
      failedPaths: [path.join(directory, 'src')],
      pairs: [],
      mutated: false,
    });
  });

  it('a source outside the tree root is accepted while a destination outside it is not', () => {
    const directory = root();
    const outside = root();
    writeFileSync(path.join(outside, 'a.txt'), 'a');
    const missingDestination = pasteBatch(directory, [path.join(outside, 'a.txt')], '../escape', 'copy');
    expect(missingDestination).toEqual({
      total: 1,
      failedPaths: [path.join(outside, 'a.txt')],
      pairs: [],
      mutated: false,
    });
    const result = pasteBatch(directory, [path.join(outside, 'a.txt')], '', 'copy');
    expect(result).toMatchObject({ total: 1, failedPaths: [] });
    expect(existsSync(path.join(directory, 'a.txt'))).toBe(true);
  });
});
