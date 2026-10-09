import { describe, it, expect } from 'vitest';
import { fileStarts, fileStop } from './file-starts';
import type { DiffFile } from '@shared/plugins/diff/shared';

function file(path: string, hunkCounts: number[]): DiffFile {
  return {
    path,
    additions: hunkCounts.reduce((total, count) => total + count, 0),
    deletions: 0,
    hunks: hunkCounts.map((lines) => ({
      oldStart: 1, newStart: 1,
      lines: Array.from({ length: lines }, (_unused, at) => ({
        kind: at === 0 ? 'added' : 'context', number: at + 1, jump: at + 1, text: `line ${at}`,
      })),
    })),
  };
}

describe('fileStarts', () => {
  it("answers where each file's hunks begin in the walk's flat list", () => {
    expect(fileStarts([file('a.txt', [2, 1]), file('b.txt', [1])])).toEqual([0, 2]);
  });

  it('leaves out a file whose hunks hold no lines', () => {
    expect(fileStarts([file('a.txt', [2, 0]), file('b.txt', [1])])).toEqual([0, 1]);
  });

  it('answers nothing for a change set with no hunks at all', () => {
    expect(fileStarts([])).toEqual([]);
    expect(fileStarts([file('bin.png', [0])])).toEqual([]);
  });
});

describe('fileStop', () => {
  // Three files holding two, one, and three hunks, so their starts are 0, 2, and 3.
  const starts = fileStarts([file('a.txt', [1, 1]), file('b.txt', [1]), file('c.txt', [1, 1, 1])]);

  it("answers the next file's first hunk going down", () => {
    expect(fileStop(starts, 0, true)).toBe(2);
    expect(fileStop(starts, 1, true)).toBe(2);
  });

  it("answers the previous file's first hunk coming back up", () => {
    expect(fileStop(starts, 3, false)).toBe(2);
    expect(fileStop(starts, 2, false)).toBe(0);
  });

  it("answers the last file's own first hunk at the end rather than wrapping", () => {
    expect(fileStop(starts, 5, true)).toBe(3);
    expect(fileStop(starts, 3, true)).toBe(3);
  });

  it("answers the first file's own first hunk at the start rather than wrapping", () => {
    expect(fileStop(starts, 0, false)).toBe(0);
  });

  it('answers nothing for a change set with no stops', () => {
    expect(fileStop([], null, true)).toBeNull();
  });
});
