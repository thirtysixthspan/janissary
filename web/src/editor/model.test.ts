import { describe, it, expect } from 'vitest';
import {
  fromText, toText, clampPos, selectionRange, selectedText, insertText,
  deleteBackward, deleteForward, killToLineEnd, setSelection, collapseSelection, selectAll,
  wordRangeAt, type EditorState,
} from './model';
import { moveCursor, movePage, moveLineEdge, moveDocumentEdge, moveToVisualTarget } from './motion';

const state = (text: string, cursor?: { line: number; col: number }, anchor: { line: number; col: number } | null = null): EditorState =>
  ({ lines: text.split('\n'), cursor: cursor ?? { line: 0, col: 0 }, anchor });

describe('fromText/toText', () => {
  it('round-trips text including a trailing newline', () => {
    expect(toText(fromText('a\nb\n'))).toBe('a\nb\n');
    expect(fromText('a\nb\n').lines).toEqual(['a', 'b', '']);
  });

  it('treats an empty document as one empty line', () => {
    expect(fromText('').lines).toEqual(['']);
  });

  it('places the cursor on the given line', () => {
    expect(fromText('a\nb\nc', 1).cursor).toEqual({ line: 1, col: 0 });
  });

  it('clamps an out-of-range line to the last line', () => {
    expect(fromText('a\nb', 99).cursor).toEqual({ line: 1, col: 0 });
  });
});

describe('clampPos', () => {
  it('clamps line and column to the document', () => {
    expect(clampPos(['ab', 'c'], { line: 5, col: 9 })).toEqual({ line: 1, col: 1 });
    expect(clampPos(['ab'], { line: -1, col: -3 })).toEqual({ line: 0, col: 0 });
  });
});

describe('insertText', () => {
  it('inserts a character at the cursor', () => {
    const next = insertText(state('helo', { line: 0, col: 3 }), 'l');
    expect(next.lines).toEqual(['hello']);
    expect(next.cursor).toEqual({ line: 0, col: 4 });
  });

  it('splits the line on Enter', () => {
    const next = insertText(state('hello', { line: 0, col: 2 }), '\n');
    expect(next.lines).toEqual(['he', 'llo']);
    expect(next.cursor).toEqual({ line: 1, col: 0 });
  });

  it('inserts multi-line paste and lands after the last fragment', () => {
    const next = insertText(state('ad', { line: 0, col: 1 }), 'b\nc');
    expect(next.lines).toEqual(['ab', 'cd']);
    expect(next.cursor).toEqual({ line: 1, col: 1 });
  });

  it('replaces an active selection first', () => {
    const next = insertText(state('abcdef', { line: 0, col: 5 }, { line: 0, col: 1 }), 'X');
    expect(next.lines).toEqual(['aXf']);
    expect(next.cursor).toEqual({ line: 0, col: 2 });
  });

  it('inserts a tab character literally', () => {
    expect(insertText(state('ab', { line: 0, col: 1 }), '\t').lines).toEqual(['a\tb']);
  });
});

describe('deleteBackward/deleteForward', () => {
  it('deletes the character before/after the cursor', () => {
    expect(deleteBackward(state('abc', { line: 0, col: 2 })).lines).toEqual(['ac']);
    expect(deleteForward(state('abc', { line: 0, col: 1 })).lines).toEqual(['ac']);
  });

  it('joins lines at line edges', () => {
    const back = deleteBackward(state('ab\ncd', { line: 1, col: 0 }));
    expect(back.lines).toEqual(['abcd']);
    expect(back.cursor).toEqual({ line: 0, col: 2 });
    expect(deleteForward(state('ab\ncd', { line: 0, col: 2 })).lines).toEqual(['abcd']);
  });

  it('is a no-op at the document edges', () => {
    expect(deleteBackward(state('ab')).lines).toEqual(['ab']);
    expect(deleteForward(state('ab', { line: 0, col: 2 })).lines).toEqual(['ab']);
  });

  it('deletes the whole selection when one is active', () => {
    const next = deleteBackward(state('ab\ncd', { line: 1, col: 1 }, { line: 0, col: 1 }));
    expect(next.lines).toEqual(['ad']);
    expect(next.cursor).toEqual({ line: 0, col: 1 });
  });
});

describe('killToLineEnd', () => {
  it('kills from the cursor to end of line', () => {
    const { state: next, killed } = killToLineEnd(state('hello world', { line: 0, col: 5 }));
    expect(next.lines).toEqual(['hello']);
    expect(killed).toBe(' world');
  });

  it('deletes the line break when already at end of line', () => {
    const { state: next, killed } = killToLineEnd(state('ab\ncd', { line: 0, col: 2 }));
    expect(next.lines).toEqual(['abcd']);
    expect(killed).toBe('\n');
  });

  it('kills nothing at the end of the last line', () => {
    const { state: next, killed } = killToLineEnd(state('ab', { line: 0, col: 2 }));
    expect(next.lines).toEqual(['ab']);
    expect(killed).toBe('');
  });
});

describe('selection', () => {
  it('orders the range regardless of anchor/cursor direction', () => {
    const s = state('abcdef', { line: 0, col: 1 }, { line: 0, col: 4 });
    expect(selectionRange(s)).toEqual({ start: { line: 0, col: 1 }, end: { line: 0, col: 4 } });
  });

  it('extracts multi-line selected text', () => {
    const s = state('ab\ncd\nef', { line: 2, col: 1 }, { line: 0, col: 1 });
    expect(selectedText(s)).toBe('b\ncd\ne');
  });

  it('collapse clears the anchor; insert substitutes the selected text', () => {
    const s = state('abc', { line: 0, col: 3 }, { line: 0, col: 0 });
    expect(selectionRange(collapseSelection(s))).toBeNull();
    expect(insertText(s, 'xy').lines).toEqual(['xy']);
  });

  it('selectAll spans the whole document', () => {
    const s = selectAll(state('ab\ncd'));
    expect(selectionRange(s)).toEqual({ start: { line: 0, col: 0 }, end: { line: 1, col: 2 } });
  });

  it('setSelection clamps both endpoints', () => {
    const s = setSelection(state('ab'), { line: 9, col: 9 }, { line: 0, col: 9 });
    expect(s.anchor).toEqual({ line: 0, col: 2 });
    expect(s.cursor).toEqual({ line: 0, col: 2 });
  });
});

describe('moveCursor', () => {
  it('wraps across line boundaries horizontally', () => {
    expect(moveCursor(state('ab\ncd', { line: 0, col: 2 }), 'right', false).cursor).toEqual({ line: 1, col: 0 });
    expect(moveCursor(state('ab\ncd', { line: 1, col: 0 }), 'left', false).cursor).toEqual({ line: 0, col: 2 });
  });

  it('clamps at the document edges', () => {
    expect(moveCursor(state('ab'), 'left', false).cursor).toEqual({ line: 0, col: 0 });
    expect(moveCursor(state('ab', { line: 0, col: 2 }), 'right', false).cursor).toEqual({ line: 0, col: 2 });
    expect(moveCursor(state('ab', { line: 0, col: 1 }), 'up', false).cursor).toEqual({ line: 0, col: 0 });
    expect(moveCursor(state('ab', { line: 0, col: 1 }), 'down', false).cursor).toEqual({ line: 0, col: 2 });
  });

  it('keeps a goal column through short lines', () => {
    let s: EditorState = { ...state('abcdef\nx\nabcdef', { line: 0, col: 4 }) };
    s = moveCursor(s, 'down', false);
    expect(s.cursor).toEqual({ line: 1, col: 1 });
    s = moveCursor(s, 'down', false);
    expect(s.cursor).toEqual({ line: 2, col: 4 });
  });

  it('extends the selection with shift and collapses to the edge without it', () => {
    const extended = moveCursor(state('abc', { line: 0, col: 1 }), 'right', true);
    expect(selectionRange(extended)).toEqual({ start: { line: 0, col: 1 }, end: { line: 0, col: 2 } });
    const collapsed = moveCursor(extended, 'left', false);
    expect(selectionRange(collapsed)).toBeNull();
    expect(collapsed.cursor).toEqual({ line: 0, col: 1 });
  });
});

describe('moveToVisualTarget', () => {
  it('moves the cursor to the given position without a selection', () => {
    const moved = moveToVisualTarget(state('abcdef\nghijkl'), { line: 1, col: 3 }, false);
    expect(moved.cursor).toEqual({ line: 1, col: 3 });
    expect(selectionRange(moved)).toBeNull();
  });

  it('clamps an out-of-range column to the target line length', () => {
    const moved = moveToVisualTarget(state('ab\ncdef'), { line: 0, col: 99 }, false);
    expect(moved.cursor).toEqual({ line: 0, col: 2 });
  });

  it('extends the selection from the pre-move cursor when extend is true', () => {
    const extended = moveToVisualTarget(state('abc\ndef', { line: 0, col: 1 }), { line: 1, col: 2 }, true);
    expect(selectionRange(extended)).toEqual({ start: { line: 0, col: 1 }, end: { line: 1, col: 2 } });
  });
});

describe('movePage / edges', () => {
  const doc = state(Array.from({ length: 50 }, (_, index) => `line${index}`).join('\n'), { line: 20, col: 3 });

  it('jumps a page of lines and clamps at the ends', () => {
    expect(movePage(doc, 1, 10, false).cursor.line).toBe(30);
    expect(movePage(doc, -1, 25, false).cursor).toEqual({ line: 0, col: 0 });
    expect(movePage(doc, 1, 100, false).cursor.line).toBe(49);
  });

  it('moveLineEdge goes to begin/end of the current line', () => {
    expect(moveLineEdge(state('hello', { line: 0, col: 3 }), 'home', false).cursor).toEqual({ line: 0, col: 0 });
    expect(moveLineEdge(state('hello', { line: 0, col: 3 }), 'end', false).cursor).toEqual({ line: 0, col: 5 });
  });

  it('moveDocumentEdge goes to document start/end and can extend', () => {
    const s = state('ab\ncd', { line: 0, col: 1 });
    expect(moveDocumentEdge(s, 'end', false).cursor).toEqual({ line: 1, col: 2 });
    const extended = moveDocumentEdge(s, 'start', true);
    expect(selectionRange(extended)).toEqual({ start: { line: 0, col: 0 }, end: { line: 0, col: 1 } });
  });
});

describe('wordRangeAt', () => {
  const lines = ['foo bar-baz', ''];

  it('selects the word run around the column', () => {
    expect(wordRangeAt(lines, 0, 5)).toEqual({ start: { line: 0, col: 4 }, end: { line: 0, col: 7 } });
  });

  it('selects whitespace and punctuation runs as their own class', () => {
    expect(wordRangeAt(lines, 0, 3)).toEqual({ start: { line: 0, col: 3 }, end: { line: 0, col: 4 } });
    expect(wordRangeAt(lines, 0, 7)).toEqual({ start: { line: 0, col: 7 }, end: { line: 0, col: 8 } });
  });

  it('snaps past-end columns to the last run and handles empty lines', () => {
    expect(wordRangeAt(lines, 0, 99)).toEqual({ start: { line: 0, col: 8 }, end: { line: 0, col: 11 } });
    expect(wordRangeAt(lines, 1, 0)).toEqual({ start: { line: 1, col: 0 }, end: { line: 1, col: 0 } });
  });
});
