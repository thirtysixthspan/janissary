// The two transforms that turn a single-caret editing rule into a multi-caret one. Movement runs
// each selection through the ordinary ./motion.ts transform on a one-selection view of the state,
// so no motion rule is restated and each caret keeps its own goal column. Editing works in absolute
// offsets over the joined document and folds left to right — appending the text between one
// selection and the next, then its replacement, and taking each caret's new offset from the output
// as it goes, so no position ever needs rebasing against another edit's delta.

import type { EditorState, Pos, Selection } from './model';
import { allSelections, selectionBounds, withSelections } from './model';
import { offsetToPos, posToOffset } from './offsets';

export type MultiEditKind = 'insert' | 'deleteBackward' | 'deleteForward';

// What one selection replaces: itself when it has one, and otherwise the character the equivalent
// single-caret rule would have removed (./model.ts `deleteBackward`, `deleteForward`) — or nothing
// at all, for an insert or at the document's edge.
function rangeFor(lines: readonly string[], sel: Selection, kind: MultiEditKind): { start: Pos; end: Pos } {
  const bounds = selectionBounds(sel);
  if (kind === 'insert' || bounds.start.line !== bounds.end.line || bounds.start.col !== bounds.end.col) return bounds;
  const { line, col } = sel.cursor;
  if (kind === 'deleteBackward') {
    if (col > 0) return { start: { line, col: col - 1 }, end: sel.cursor };
    if (line > 0) return { start: { line: line - 1, col: lines[line - 1].length }, end: sel.cursor };
    return bounds;
  }
  if (col < lines[line].length) return { start: sel.cursor, end: { line, col: col + 1 } };
  if (line < lines.length - 1) return { start: sel.cursor, end: { line: line + 1, col: 0 } };
  return bounds;
}

// `textFor` is asked by document-order position, which is what makes distributing one clipboard
// line per selection (see ./applyKeyAction.ts) mean what a reader expects it to mean.
export function multiEdit(s: EditorState, kind: MultiEditKind, textFor: (index: number) => string): EditorState {
  const created = allSelections(s);
  const ordered = created
    .map((sel, index) => ({ sel, index }))
    .toSorted((a, b) => {
      const [x, y] = [selectionBounds(a.sel).start, selectionBounds(b.sel).start];
      return x.line - y.line || x.col - y.col;
    });

  const document = s.lines.join('\n');
  let out = '';
  let read = 0;
  const cursors: number[] = [];
  for (const [position, entry] of ordered.entries()) {
    const range = rangeFor(s.lines, entry.sel, kind);
    const [start, end] = [posToOffset(s.lines, range.start), posToOffset(s.lines, range.end)];
    out += document.slice(read, start) + (kind === 'insert' ? textFor(position) : '');
    cursors.push(out.length);
    read = end;
  }
  out += document.slice(read);

  const lines = out.split('\n');
  const placed: Selection[] = [];
  for (const [position, entry] of ordered.entries()) {
    placed[entry.index] = { anchor: null, cursor: offsetToPos(lines, cursors[position]) };
  }
  return withSelections({ ...s, lines }, placed);
}

export function multiMove(s: EditorState, move: (one: EditorState) => EditorState): EditorState {
  const moved = allSelections(s).map((sel) => {
    // A one-selection view: the set is deliberately not carried in, so a motion transform that
    // spreads its input can never resurrect it.
    const one = move({ lines: s.lines, cursor: sel.cursor, anchor: sel.anchor, goalCol: sel.goalCol });
    return { anchor: one.anchor, cursor: one.cursor, goalCol: one.goalCol };
  });
  return withSelections(s, moved);
}
