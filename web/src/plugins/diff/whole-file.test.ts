import { describe, it, expect } from 'vitest';
import { isWholeFileChange } from './whole-file';
import type { DiffFile } from '@shared/plugins/diff/shared';

function file(lines: DiffFile['hunks'][number]['lines']): DiffFile {
  return {
    path: 'a.txt', additions: 1, deletions: 1,
    hunks: [{ oldStart: 1, newStart: 1, lines }],
  };
}

describe('isWholeFileChange', () => {
  it('answers true for a file whose every line is added', () => {
    expect(isWholeFileChange(file([
      { kind: 'added', number: 1, jump: 1, text: 'new' },
      { kind: 'added', number: 2, jump: 2, text: 'too' },
    ]))).toBe(true);
  });

  it('answers true for a file whose every line is removed', () => {
    expect(isWholeFileChange(file([
      { kind: 'removed', number: 1, jump: 1, text: 'gone' },
    ]))).toBe(true);
  });

  it('answers true for a rewrite that replaced every line', () => {
    expect(isWholeFileChange(file([
      { kind: 'removed', number: 1, jump: 1, text: 'old' },
      { kind: 'added', number: 1, jump: 1, text: 'new' },
    ]))).toBe(true);
  });

  it('answers false for a change that left a surviving line', () => {
    expect(isWholeFileChange(file([
      { kind: 'context', number: 1, jump: 1, text: 'kept' },
      { kind: 'added', number: 2, jump: 2, text: 'here' },
    ]))).toBe(false);
  });

  it('answers false for a record with no hunks, such as a binary or mode-only change', () => {
    expect(isWholeFileChange({ path: 'a.bin', additions: 0, deletions: 0, hunks: [] })).toBe(false);
  });
});
