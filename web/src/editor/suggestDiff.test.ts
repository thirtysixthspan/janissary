import { describe, it, expect } from 'vitest';
import type { EditorState } from './model';
import { applyHunk, spliceHunk, suggestDiffPreview } from './suggestDiff';

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

describe('applyHunk', () => {
  const at = (line: number, col: number) => ({ line, col });
  const single = (lines: string[], cursor: { line: number; col: number }): EditorState => ({ lines, cursor, anchor: null });

  it('returns null when the anchor does not match', () => {
    expect(applyHunk(single(['one'], at(0, 0)), { anchor: 'missing', replacement: 'x' })).toBeNull();
  });

  it('applies the hunk and keeps the caret line and column when both still exist', () => {
    const next = applyHunk(single(['one', 'two words'], at(1, 4)), { anchor: 'one', replacement: 'ONE' });
    expect(next?.lines).toEqual(['ONE', 'two words']);
    expect(next?.cursor).toEqual(at(1, 4));
    expect(next?.anchor).toBeNull();
  });

  it('clamps the caret column when its line got shorter', () => {
    const next = applyHunk(single(['long line'], at(0, 8)), { anchor: 'long line', replacement: 'ab' });
    expect(next?.cursor).toEqual(at(0, 2));
  });

  it('clamps the caret line when its line no longer exists', () => {
    const next = applyHunk(single(['a', 'b', 'c'], at(2, 1)), { anchor: 'a\nb\nc', replacement: 'x' });
    expect(next?.lines).toEqual(['x']);
    expect(next?.cursor).toEqual(at(0, 1));
  });

  it('keeps extra selections, clamped, and merges two that converge', () => {
    const state: EditorState = {
      lines: ['abc', 'def', 'ghi'],
      cursor: at(0, 1),
      anchor: null,
      extraSelections: [{ anchor: at(1, 0), cursor: at(1, 3) }, { anchor: null, cursor: at(2, 2) }, { anchor: null, cursor: at(2, 3) }],
    };
    const next = applyHunk(state, { anchor: 'ghi', replacement: 'g' });
    expect(next?.lines).toEqual(['abc', 'def', 'g']);
    expect(next?.cursor).toEqual(at(0, 1));
    expect(next?.extraSelections).toEqual([{ anchor: at(1, 0), cursor: at(1, 3) }, { anchor: null, cursor: at(2, 1) }]);
  });
});
