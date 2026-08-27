import { describe, it, expect } from 'vitest';
import type { EditorState } from './model';
import { moveCursor, moveLineEdge } from './motion';
import { multiEdit, multiMove } from './multi-caret';

// Three selections over the three `foo`s of 'foo foo foo', the last one primary.
const threeFoos = (): EditorState => ({
  lines: ['foo foo foo'],
  cursor: { line: 0, col: 11 },
  anchor: { line: 0, col: 8 },
  extraSelections: [
    { anchor: { line: 0, col: 0 }, cursor: { line: 0, col: 3 } },
    { anchor: { line: 0, col: 4 }, cursor: { line: 0, col: 7 } },
  ],
});

describe('multiEdit', () => {
  it('replaces every selection on one line, computing each new caret from the output', () => {
    const next = multiEdit(threeFoos(), 'insert', () => 'X');
    expect(next.lines).toEqual(['X X X']);
    expect(next.extraSelections).toEqual([
      { anchor: null, cursor: { line: 0, col: 1 } },
      { anchor: null, cursor: { line: 0, col: 3 } },
    ]);
    expect(next.cursor).toEqual({ line: 0, col: 5 });
  });

  it('asks for text by document-order position, whatever the creation order was', () => {
    const next = multiEdit(threeFoos(), 'insert', String);
    expect(next.lines).toEqual(['0 1 2']);
  });

  it('keeps each caret with its own selection when the primary is not last in the document', () => {
    const state: EditorState = {
      lines: ['aa bb'],
      cursor: { line: 0, col: 2 },
      anchor: { line: 0, col: 0 },
      extraSelections: [{ anchor: { line: 0, col: 3 }, cursor: { line: 0, col: 5 } }],
    };
    const next = multiEdit(state, 'insert', () => 'z');
    expect(next.lines).toEqual(['z z']);
    // The primary is still the selection that was primary going in — the first one on the line.
    expect(next.cursor).toEqual({ line: 0, col: 1 });
    expect(next.extraSelections).toEqual([{ anchor: null, cursor: { line: 0, col: 3 } }]);
  });

  it('inserts text that spans lines at every selection', () => {
    const next = multiEdit(threeFoos(), 'insert', () => 'x\ny');
    expect(next.lines).toEqual(['x', 'y x', 'y x', 'y']);
  });

  it('deletes backward one character at every bare caret', () => {
    const state: EditorState = {
      lines: ['abcd'],
      cursor: { line: 0, col: 4 },
      anchor: null,
      extraSelections: [{ anchor: null, cursor: { line: 0, col: 2 } }],
    };
    expect(multiEdit(state, 'deleteBackward', () => '').lines).toEqual(['ac']);
  });

  it('joins lines when a caret deletes backward from column 0', () => {
    const state: EditorState = {
      lines: ['ab', 'cd'],
      cursor: { line: 1, col: 0 },
      anchor: null,
      extraSelections: [{ anchor: null, cursor: { line: 0, col: 1 } }],
    };
    expect(multiEdit(state, 'deleteBackward', () => '').lines).toEqual(['bcd']);
  });

  it('leaves a caret at the document edge alone rather than deleting past it', () => {
    const state: EditorState = {
      lines: ['ab'],
      cursor: { line: 0, col: 0 },
      anchor: null,
      extraSelections: [{ anchor: null, cursor: { line: 0, col: 2 } }],
    };
    expect(multiEdit(state, 'deleteBackward', () => '').lines).toEqual(['a']);
    expect(multiEdit(state, 'deleteForward', () => '').lines).toEqual(['b']);
  });

  it('deletes a selection rather than a character when there is one', () => {
    expect(multiEdit(threeFoos(), 'deleteForward', () => '').lines).toEqual(['  ']);
  });
});

describe('multiMove', () => {
  it('runs every selection through the same motion transform', () => {
    const next = multiMove(threeFoos(), (one) => moveCursor(one, 'left', false));
    expect(next.extraSelections).toEqual([
      { anchor: null, cursor: { line: 0, col: 0 }, goalCol: undefined },
      { anchor: null, cursor: { line: 0, col: 4 }, goalCol: undefined },
    ]);
    expect(next.cursor).toEqual({ line: 0, col: 8 });
  });

  it('merges carets that converge, so one edit is never applied twice', () => {
    const state: EditorState = {
      lines: ['abc'],
      cursor: { line: 0, col: 1 },
      anchor: null,
      extraSelections: [{ anchor: null, cursor: { line: 0, col: 2 } }],
    };
    const next = multiMove(state, (one) => moveLineEdge(one, 'end', false));
    expect(next.extraSelections).toEqual([]);
    expect(next.cursor).toEqual({ line: 0, col: 3 });
  });

  it('gives each caret its own goal column across a short line', () => {
    const state: EditorState = {
      lines: ['abcdef', 'abcd', 'abcdef'],
      cursor: { line: 0, col: 6 },
      anchor: null,
      extraSelections: [{ anchor: null, cursor: { line: 0, col: 2 } }],
    };
    const down = (s: EditorState) => moveCursor(s, 'down', false);
    const once = multiMove(state, down);
    // The primary is clamped to the short line, the other caret is not, and each remembers where
    // it came from — so the next line restores the primary's column without disturbing the other.
    expect(once.cursor).toEqual({ line: 1, col: 4 });
    const twice = multiMove(once, down);
    expect(twice.cursor).toEqual({ line: 2, col: 6 });
    expect(twice.extraSelections).toEqual([{ anchor: null, cursor: { line: 2, col: 2 }, goalCol: 2 }]);
  });
});
