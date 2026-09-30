import { describe, expect, it } from 'vitest';
import { compileMatcher } from './compile-matcher.js';
import { fileMatches, matchFile, splitLines } from './search-files.js';

const todo = compileMatcher('todo', { regex: false, matchCase: false, wholeWord: false })!;

describe('splitLines', () => {
  it('splits on newlines', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('drops a single trailing newline rather than adding a blank line', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
  });

  it('keeps a blank interior line', () => {
    expect(splitLines('a\n\nb')).toEqual(['a', '', 'b']);
  });

  it('yields nothing for empty text', () => {
    expect(splitLines('')).toEqual([]);
    expect(splitLines('\n')).toEqual(['']);
  });

  it('keeps a last line with no trailing newline', () => {
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
  });
});

describe('matchFile', () => {
  it('returns one row per matching line, in line order', () => {
    const rows = matchFile('a.ts', 'x\ntodo one\ny\ntodo two\nz', todo);
    expect(rows.map((row) => row.line)).toEqual([2, 4]);
    expect(rows.every((row) => row.path === 'a.ts')).toBe(true);
  });

  it('carries the matching line verbatim', () => {
    expect(matchFile('a.ts', '  // todo: fix', todo)[0].match).toBe('  // todo: fix');
  });

  it('carries two context lines either side of a middle match', () => {
    const text = ['one', 'two', 'todo', 'four', 'five'].join('\n');
    const [row] = matchFile('a.ts', text, todo);
    expect(row.above).toEqual(['one', 'two']);
    expect(row.below).toEqual(['four', 'five']);
  });

  it('clips context at the start of a file rather than padding it', () => {
    const [row] = matchFile('a.ts', 'todo\ntwo\nthree', todo);
    expect(row.above).toEqual([]);
    expect(row.below).toEqual(['two', 'three']);
  });

  it('clips context at the end of a file rather than padding it', () => {
    const [row] = matchFile('a.ts', 'one\ntwo\ntodo', todo);
    expect(row.above).toEqual(['one', 'two']);
    expect(row.below).toEqual([]);
  });

  it('gives a match on the first line an empty above and two below', () => {
    const [row] = matchFile('a.ts', 'todo\ntwo\nthree\nfour', todo);
    expect(row.line).toBe(1);
    expect(row.above).toEqual([]);
    expect(row.below).toEqual(['two', 'three']);
  });

  it('returns nothing for a file with no match', () => {
    expect(matchFile('a.ts', 'one\ntwo', todo)).toEqual([]);
  });

  it('returns nothing for an empty file', () => {
    expect(matchFile('a.ts', '', todo)).toEqual([]);
  });

  it('counts every occurrence on one line as a single row', () => {
    expect(matchFile('a.ts', 'todo and todo', todo)).toHaveLength(1);
  });
});

describe('fileMatches', () => {
  it('agrees with matchFile whenever a file has a match', () => {
    const cases = ['', 'one', 'todo', 'one\ntodo\ntwo', 'a\nb\nc', 'todo\ntodo'];
    for (const text of cases) {
      expect(fileMatches(splitLines(text), todo)).toBe(matchFile('a.ts', text, todo).length > 0);
    }
  });

  it('is false for a file with no match and true for one with', () => {
    expect(fileMatches(splitLines('one\ntwo'), todo)).toBe(false);
    expect(fileMatches(splitLines('one\ntodo'), todo)).toBe(true);
  });
});
