import { describe, it, expect } from 'vitest';
import { spliceHunk, suggestDiffPreview } from './suggestDiff';

describe('spliceHunk', () => {
  it('replaces the anchor with the replacement', () => {
    expect(spliceHunk('one\ntwo\nthree', { anchor: 'two', replacement: 'TWO' })).toBe('one\nTWO\nthree');
  });

  it('appends the replacement when the anchor is empty', () => {
    expect(spliceHunk('one\ntwo', { anchor: '', replacement: '\nthree' })).toBe('one\ntwo\nthree');
  });

  it('returns null when the anchor does not match', () => {
    expect(spliceHunk('one\ntwo', { anchor: 'missing', replacement: 'x' })).toBeNull();
  });
});

describe('suggestDiffPreview', () => {
  it('previews a single-line replacement', () => {
    expect(suggestDiffPreview(['one', 'two', 'three'], { anchor: 'two', replacement: 'TWO' }))
      .toEqual({ startLine: 1, removedCount: 1, added: ['TWO'] });
  });

  it('previews a multi-line replacement', () => {
    expect(suggestDiffPreview(['one', 'two', 'three', 'four'], { anchor: 'two\nthree', replacement: 'TWO\nTHREE\nEXTRA' }))
      .toEqual({ startLine: 1, removedCount: 2, added: ['TWO', 'THREE', 'EXTRA'] });
  });

  it('previews an appended hunk as a pure insertion with no removed lines', () => {
    expect(suggestDiffPreview(['one', 'two'], { anchor: '', replacement: '\nthree' }))
      .toEqual({ startLine: 2, removedCount: 0, added: ['three'] });
  });

  it('returns null when the anchor does not match', () => {
    expect(suggestDiffPreview(['one', 'two'], { anchor: 'missing', replacement: 'x' })).toBeNull();
  });
});
