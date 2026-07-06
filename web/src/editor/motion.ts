// Pure cursor-movement transitions for the editor. Split from model.ts (editing transitions)
// to respect the file-size limit; both are covered by model.test.ts.

import type { EditorState, Pos } from './model';
import { clampPos, selectionRange } from './model';

export type Direction = 'left' | 'right' | 'up' | 'down';

// Move (or extend to) `pos`. When extending, the anchor is pinned at the pre-move cursor.
function moveTo(s: EditorState, pos: Pos, extend: boolean, goalCol?: number): EditorState {
  const cursor = clampPos(s.lines, pos);
  const anchor = extend ? (s.anchor ?? s.cursor) : null;
  return { ...s, cursor, anchor, goalCol };
}

function horizontalTarget(s: EditorState, dir: 'left' | 'right'): Pos {
  const { line, col } = s.cursor;
  if (dir === 'left') {
    if (col > 0) return { line, col: col - 1 };
    return line > 0 ? { line: line - 1, col: s.lines[line - 1].length } : s.cursor;
  }
  if (col < s.lines[line].length) return { line, col: col + 1 };
  return line < s.lines.length - 1 ? { line: line + 1, col: 0 } : s.cursor;
}

function moveToVertical(s: EditorState, target: number, goal: number, extend: boolean): EditorState {
  // Moving past the first/last line goes to the document start/end (standard behavior).
  if (target < 0) return moveTo(s, { line: 0, col: 0 }, extend);
  if (target >= s.lines.length) return moveTo(s, { line: s.lines.length - 1, col: s.lines.at(-1)!.length }, extend);
  return moveTo(s, { line: target, col: goal }, extend, goal);
}

export function moveCursor(s: EditorState, dir: Direction, extend: boolean): EditorState {
  const sel = selectionRange(s);
  if (dir === 'left' || dir === 'right') {
    if (sel && !extend) return { ...s, cursor: dir === 'left' ? sel.start : sel.end, anchor: null, goalCol: undefined };
    return moveTo(s, horizontalTarget(s, dir), extend);
  }
  const goal = s.goalCol ?? s.cursor.col;
  const target = dir === 'up' ? s.cursor.line - 1 : s.cursor.line + 1;
  return moveToVertical(s, target, goal, extend);
}

// PageUp/PageDown: jump a viewport's worth of lines, keeping the goal column.
export function movePage(s: EditorState, dir: -1 | 1, pageLines: number, extend: boolean): EditorState {
  const goal = s.goalCol ?? s.cursor.col;
  const target = s.cursor.line + dir * Math.max(1, pageLines);
  return moveToVertical(s, target, goal, extend);
}

export function moveLineEdge(s: EditorState, edge: 'home' | 'end', extend: boolean): EditorState {
  const { line } = s.cursor;
  return moveTo(s, { line, col: edge === 'home' ? 0 : s.lines[line].length }, extend);
}

export function moveDocumentEdge(s: EditorState, edge: 'start' | 'end', extend: boolean): EditorState {
  return moveTo(s, edge === 'start' ? { line: 0, col: 0 } : { line: s.lines.length - 1, col: s.lines.at(-1)!.length }, extend);
}
