import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { isDir, longestCommonPrefix, splitToken, replaceToken, completeWord } from './helpers.js';

describe('isDir', () => {
  it('returns true for a real directory', () => {
    expect(isDir(tmpdir())).toBe(true);
  });

  it('returns false for a path that does not exist', () => {
    expect(isDir(path.join(tmpdir(), 'no-such-dir-xyz'))).toBe(false);
  });

  it('returns false for a file', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'completion-helpers-'));
    const file = path.join(dir, 'file.txt');
    writeFileSync(file, '');
    expect(isDir(file)).toBe(false);
  });
});

describe('longestCommonPrefix', () => {
  it('returns an empty string for an empty list', () => {
    expect(longestCommonPrefix([])).toBe('');
  });

  it('returns the item itself for a single-item list', () => {
    expect(longestCommonPrefix(['foo.txt'])).toBe('foo.txt');
  });

  it('finds the shared prefix across several items', () => {
    expect(longestCommonPrefix(['foobar', 'foobaz', 'foo'])).toBe('foo');
  });

  it('returns an empty string when there is no common prefix', () => {
    expect(longestCommonPrefix(['abc', 'xyz'])).toBe('');
  });
});

describe('splitToken', () => {
  it('treats a slash-less token as a bare base name in cwd', () => {
    expect(splitToken('read', '/repo')).toEqual({ dir: '/repo', base: 'read' });
  });

  it('splits on the last slash and resolves dir against cwd', () => {
    expect(splitToken('src/comp', '/repo')).toEqual({ dir: '/repo/src', base: 'comp' });
  });

  it('treats a trailing-slash token as browsing that directory with an empty base', () => {
    expect(splitToken('src/', '/repo')).toEqual({ dir: '/repo/src', base: '' });
  });

  it('resolves an absolute path independent of cwd', () => {
    expect(splitToken('/etc/pass', '/repo')).toEqual({ dir: '/etc', base: 'pass' });
  });

  it('falls back to the filesystem root when the token is just a slash', () => {
    expect(splitToken('/', '/repo')).toEqual({ dir: '/', base: '' });
  });

  it('expands a leading ~ to the home directory', () => {
    expect(splitToken('~/proj', '/repo')).toEqual({ dir: homedir(), base: 'proj' });
  });
});

describe('replaceToken', () => {
  it('splices the new token in at tokenStart and reports the resulting cursor', () => {
    const result = replaceToken('open fi', 'le.txt', 5, 'notes.txt', ['notes.txt']);
    expect(result).toEqual({ newInput: 'open notes.txtle.txt', newCursor: 'open notes.txt'.length, matches: ['notes.txt'] });
  });
});

describe('completeWord', () => {
  it('returns no matches unchanged when nothing starts with the partial', () => {
    const result = completeWord('zz', '', ['alpha', 'beta'], ' ', 'cmd zz', '', 4);
    expect(result).toEqual({ newInput: 'cmd zz', newCursor: 'cmd zz'.length, matches: [] });
  });

  it('completes a single match and appends the suffix', () => {
    const result = completeWord('al', '', ['alpha', 'beta'], ' ', 'cmd al', '', 4);
    expect(result.matches).toEqual(['alpha']);
    expect(result.newInput).toBe('cmd alpha ');
  });

  it('completes to the longest common prefix across multiple matches, without the suffix', () => {
    const result = completeWord('al', '', ['alpha', 'album'], ' ', 'cmd al', '', 4);
    expect(result.matches.toSorted((a, b) => a.localeCompare(b))).toEqual(['album', 'alpha']);
    expect(result.newInput).toBe('cmd al');
  });

  it('keeps a prefix (e.g. a directory path) ahead of the completed token', () => {
    const result = completeWord('fo', 'src/', ['foo.ts'], '', 'open src/fo', '', 5);
    expect(result.newInput).toBe('open src/foo.ts');
  });
});
