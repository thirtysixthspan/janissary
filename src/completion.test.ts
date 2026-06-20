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

describe('completeCommandLine — agent names', () => {
  const agents = ['janus', 'bilal', 'aslan'];
  const noFiles = '/no/such/dir/xyz'; // file fallback is a no-op here

  it('completes a unique agent recipient for msg and adds a space', () => {
    expect(completeCommandLine('msg bi', 6, noFiles, agents).newInput).toBe('msg bilal ');
  });

  it('fills the common prefix when several agents match', () => {
    expect(completeCommandLine('msg a', 5, noFiles, agents).newInput).toBe('msg aslan '); // only aslan starts with "a"
    const r = completeCommandLine('msg ', 4, noFiles, ['ahmed', 'aslan']);
    expect(r.newInput).toBe('msg a'); // ahmed/aslan -> common prefix "a"
    expect(r.matches.sort()).toEqual(['ahmed', 'aslan']);
  });

  it('offers "all" and supports comma lists for broadcast', () => {
    expect(completeCommandLine('broadcast al', 12, noFiles, agents).newInput).toBe('broadcast all');
    // complete the segment after the last comma, preserving what was typed
    expect(completeCommandLine('broadcast bilal,as', 18, noFiles, agents).newInput).toBe('broadcast bilal,aslan');
  });

  it('does not complete agents past the recipient position', () => {
    // the message text position is not an agent slot, so no agent name is filled in
    expect(completeCommandLine('msg bilal jan', 13, noFiles, agents).newInput).toBe('msg bilal jan');
  });
});
