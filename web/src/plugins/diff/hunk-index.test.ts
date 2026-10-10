import { describe, it, expect } from 'vitest';
import { hunkOffset, hunkSpots } from './hunk-index';
import type { DiffFile } from '@shared/plugins/diff/shared';

function file(path: string, hunkCounts: number[]): DiffFile {
  return {
    path,
    additions: hunkCounts.reduce((total, count) => total + count, 0),
    deletions: 0,
    hunks: Array.from({ length: hunkCounts.length }, (_unused, hunk) => ({
      oldStart: 1 + hunk,
      newStart: 1 + hunk,
      lines: Array.from({ length: hunkCounts[hunk] }, (_unused, line) => ({
        kind: line === 0 ? 'added' : 'context', number: 1 + line, jump: 1 + line, text: `line ${line}`,
      })),
    })),
  } as DiffFile;
}

describe('hunkSpots', () => {
  it('flattens the change set into one ordered list in file order', () => {
    const spots = hunkSpots([file('a.txt', [1, 2]), file('b.txt', [1])]);
    expect(spots).toEqual([
      { file: 0, hunk: 0, line: 1 },
      { file: 0, hunk: 1, line: 1 },
      { file: 1, hunk: 0, line: 1 },
    ]);
  });

  it('answers the hunk\'s first added line as the line a Return opens at', () => {
    const files = [{
      path: 'a.txt', additions: 1, deletions: 1,
      hunks: [{
        oldStart: 1, newStart: 1,
        lines: [
          { kind: 'context', number: 1, jump: 1, text: 'kept' },
          { kind: 'removed', number: 2, jump: 3, text: 'gone' },
          { kind: 'added', number: 3, jump: 3, text: 'here' },
          { kind: 'added', number: 4, jump: 4, text: 'too' },
        ],
      }],
    }] as DiffFile[];
    expect(hunkSpots(files)).toEqual([{ file: 0, hunk: 0, line: 3 }]);
  });

  it('answers the first line for a hunk that only removes', () => {
    const files = [{
      path: 'a.txt', additions: 0, deletions: 1,
      hunks: [{
        oldStart: 1, newStart: 1,
        lines: [
          { kind: 'context', number: 1, jump: 1, text: 'kept' },
          { kind: 'removed', number: 2, jump: 1, text: 'gone' },
        ],
      }],
    }] as DiffFile[];
    expect(hunkSpots(files)).toEqual([{ file: 0, hunk: 0, line: 1 }]);
  });

  it('skips a hunk with no lines', () => {
    const files = [file('a.txt', [2, 0, 1])];
    expect(hunkSpots(files).map((spot) => spot.hunk)).toEqual([0, 2]);
  });

  it('answers nothing for a change set with no hunks', () => {
    expect(hunkSpots([])).toEqual([]);
  });
});

describe('hunkOffset', () => {
  it('counts the hunks the files above contribute', () => {
    const files = [file('a.txt', [1, 2]), file('b.txt', [1]), file('c.txt', [3])];
    expect(hunkOffset(files, 0)).toBe(0);
    expect(hunkOffset(files, 1)).toBe(2);
    expect(hunkOffset(files, 2)).toBe(3);
    expect(hunkOffset(files, 3)).toBe(4);
  });
});
