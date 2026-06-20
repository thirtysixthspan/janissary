import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { completeCommandLine } from './completion.js';

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'compl-'));
  writeFileSync(join(dir, 'report.txt'), '');
  writeFileSync(join(dir, 'unique.log'), '');
  writeFileSync(join(dir, 'data1.csv'), '');
  writeFileSync(join(dir, 'data2.csv'), '');
  writeFileSync(join(dir, '.hidden'), '');
  mkdirSync(join(dir, 'srcdir'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe('completeCommandLine', () => {
  it('completes a unique file and appends a space', () => {
    const r = completeCommandLine('cat uni', 7, dir);
    expect(r.newInput).toBe('cat unique.log ');
    expect(r.newCursor).toBe(r.newInput.length);
  });

  it('appends a trailing slash for a unique directory match', () => {
    const r = completeCommandLine('ls src', 6, dir);
    expect(r.newInput).toBe('ls srcdir/');
  });

  it('extends to the longest common prefix for multiple matches', () => {
    const r = completeCommandLine('cat da', 6, dir);
    expect(r.newInput).toBe('cat data'); // data1.csv / data2.csv share the prefix "data"
    expect(r.matches.sort()).toEqual(['data1.csv', 'data2.csv']);
  });

  it('reports all matches when no further completion is possible', () => {
    const r = completeCommandLine('cat data', 8, dir);
    expect(r.newInput).toBe('cat data');
    expect(r.matches.sort()).toEqual(['data1.csv', 'data2.csv']);
  });

  it('completes a unique deeper match fully', () => {
    const r = completeCommandLine('cat rep', 7, dir);
    expect(r.newInput).toBe('cat report.txt ');
  });

  it('hides dotfiles unless the token starts with a dot', () => {
    expect(completeCommandLine('cat ', 4, dir).matches).not.toContain('.hidden');
    expect(completeCommandLine('cat .', 5, dir).matches).toContain('.hidden');
  });

  it('completes the token at the cursor, not the end of the line', () => {
    const r = completeCommandLine('cat uni file', 7, dir);
    expect(r.newInput).toBe('cat unique.log  file');
    expect(r.newCursor).toBe('cat unique.log '.length);
  });

  it('returns no matches for an unknown prefix', () => {
    const r = completeCommandLine('cat zzz', 7, dir);
    expect(r.matches).toEqual([]);
    expect(r.newInput).toBe('cat zzz');
  });
});
