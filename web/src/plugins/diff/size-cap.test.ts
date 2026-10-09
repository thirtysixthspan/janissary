import { describe, it, expect } from 'vitest';
import { CHANGE_LINE_CAP, oversizedLines } from './size-cap';
import type { DiffFile } from '@shared/plugins/diff/shared';

function file(additions: number, deletions = 0): DiffFile {
  return {
    path: 'a.txt', additions, deletions,
    hunks: [{ oldStart: 1, newStart: 1, lines: [{ kind: 'added', number: 1, jump: 1, text: 'here' }] }],
  };
}

describe('oversizedLines', () => {
  it('answers how far past the cap a larger change is', () => {
    expect(oversizedLines(file(CHANGE_LINE_CAP + 40))).toBe(40);
  });

  it('counts a change\'s added and removed lines together', () => {
    expect(oversizedLines(file(CHANGE_LINE_CAP, 1))).toBe(1);
  });

  it('answers 0 for a change within the cap', () => {
    expect(oversizedLines(file(CHANGE_LINE_CAP))).toBe(0);
    expect(oversizedLines(file(1))).toBe(0);
  });

  it('answers 0 for a record with no hunks, such as a binary or mode-only change', () => {
    expect(oversizedLines({ path: 'a.bin', additions: 0, deletions: 0, hunks: [] })).toBe(0);
  });
});
