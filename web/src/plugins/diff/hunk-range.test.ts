import { describe, it, expect } from 'vitest';
import { hunkRange } from './hunk-range';
import type { DiffHunk } from '@shared/plugins/diff/shared';

function hunk(oldStart: number, newStart: number, kinds: DiffHunk['lines'][number]['kind'][]): DiffHunk {
  return {
    oldStart, newStart,
    lines: kinds.map((kind, index) => ({ kind, number: 1 + index, jump: 1 + index, text: `line ${index}` })),
  };
}

describe('hunkRange', () => {
  it('names both sides\' start line and the lines each side holds', () => {
    expect(hunkRange(hunk(12, 12, ['context', 'removed', 'added', 'context'])))
      .toBe('@@ -12,3 +12,3 @@');
  });

  it('answers the new side\'s length as 0 for a hunk that only removes', () => {
    expect(hunkRange(hunk(1, 0, ['removed', 'removed']))).toBe('@@ -1,2 +0,0 @@');
  });

  it('answers the original side\'s length as 0 for a hunk that only adds', () => {
    expect(hunkRange(hunk(0, 1, ['added', 'added']))).toBe('@@ -0,0 +1,2 @@');
  });
});
