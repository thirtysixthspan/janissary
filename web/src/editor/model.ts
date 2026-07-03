// The editor's document/cursor/selection state and its pure editing transitions. Movement
// transitions live in ./motion.ts; both are exercised directly by model.test.ts.

export type Pos = { line: number; col: number };

export type EditorState = {
  lines: string[];
  cursor: Pos;
  // Selection anchor; null = no selection. The selection spans anchor..cursor in either order.
  anchor: Pos | null;
  // Preferred column for vertical movement across short lines; set by up/down, cleared otherwise.
  goalCol?: number;
};

export const fromText = (text: string): EditorState => ({ lines: text.split('\n'), cursor: { line: 0, col: 0 }, anchor: null });

export const toText = (s: EditorState): string => s.lines.join('\n');

const clampNumber = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function clampPos(lines: string[], p: Pos): Pos {
  const line = clampNumber(p.line, 0, lines.length - 1);
  return { line, col: clampNumber(p.col, 0, lines[line].length) };
}

export const samePos = (a: Pos, b: Pos): boolean => a.line === b.line && a.col === b.col;

export const posBefore = (a: Pos, b: Pos): boolean => a.line < b.line || (a.line === b.line && a.col < b.col);

// Ordered selection endpoints, or null when there is no (non-empty) selection.
export function selectionRange(s: EditorState): { start: Pos; end: Pos } | null {
  if (!s.anchor || samePos(s.anchor, s.cursor)) return null;
  return posBefore(s.anchor, s.cursor) ? { start: s.anchor, end: s.cursor } : { start: s.cursor, end: s.anchor };
}

export function selectedText(s: EditorState): string {
  const r = selectionRange(s);
  if (!r) return '';
  if (r.start.line === r.end.line) return s.lines[r.start.line].slice(r.start.col, r.end.col);
  return [
    s.lines[r.start.line].slice(r.start.col),
    ...s.lines.slice(r.start.line + 1, r.end.line),
    s.lines[r.end.line].slice(0, r.end.col),
  ].join('\n');
}

// Remove [start, end) and place the cursor at start.
function deleteRange(s: EditorState, start: Pos, end: Pos): EditorState {
  const lines = [...s.lines];
  const merged = lines[start.line].slice(0, start.col) + lines[end.line].slice(end.col);
  lines.splice(start.line, end.line - start.line + 1, merged);
  return { lines, cursor: start, anchor: null };
}

function deleteSelection(s: EditorState): EditorState {
  const r = selectionRange(s);
  return r ? deleteRange(s, r.start, r.end) : { ...s, anchor: null, goalCol: undefined };
}

// Insert text at the cursor, first deleting any active selection (as editors conventionally do).
// Multi-line text (paste, Enter as '\n') splits the current line.
export function insertText(s: EditorState, text: string): EditorState {
  const base = deleteSelection(s);
  const { line, col } = base.cursor;
  const inserted = text.split('\n');
  const head = base.lines[line].slice(0, col);
  const tail = base.lines[line].slice(col);
  const lines = [...base.lines];
  if (inserted.length === 1) {
    lines[line] = head + text + tail;
    return { lines, cursor: { line, col: col + text.length }, anchor: null };
  }
  const last = inserted.at(-1)!;
  lines.splice(line, 1, head + inserted[0], ...inserted.slice(1, -1), last + tail);
  return { lines, cursor: { line: line + inserted.length - 1, col: last.length }, anchor: null };
}

export function deleteBackward(s: EditorState): EditorState {
  if (selectionRange(s)) return deleteSelection(s);
  const { line, col } = s.cursor;
  if (col > 0) return deleteRange(s, { line, col: col - 1 }, s.cursor);
  if (line === 0) return { ...s, anchor: null };
  return deleteRange(s, { line: line - 1, col: s.lines[line - 1].length }, s.cursor);
}

export function deleteForward(s: EditorState): EditorState {
  if (selectionRange(s)) return deleteSelection(s);
  const { line, col } = s.cursor;
  if (col < s.lines[line].length) return deleteRange(s, s.cursor, { line, col: col + 1 });
  if (line === s.lines.length - 1) return { ...s, anchor: null };
  return deleteRange(s, s.cursor, { line: line + 1, col: 0 });
}

// Emacs-style C-k: remove cursor→end-of-line (or the line break when already at end of line) and
// return the removed text for the kill buffer.
export function killToLineEnd(s: EditorState): { state: EditorState; killed: string } {
  const { line, col } = s.cursor;
  if (col < s.lines[line].length) {
    return { state: deleteRange(s, s.cursor, { line, col: s.lines[line].length }), killed: s.lines[line].slice(col) };
  }
  if (line === s.lines.length - 1) return { state: s, killed: '' };
  return { state: deleteRange(s, s.cursor, { line: line + 1, col: 0 }), killed: '\n' };
}

export function setSelection(s: EditorState, anchor: Pos, cursor: Pos): EditorState {
  return { ...s, anchor: clampPos(s.lines, anchor), cursor: clampPos(s.lines, cursor), goalCol: undefined };
}

export function collapseSelection(s: EditorState): EditorState {
  return { ...s, anchor: null };
}

export function selectAll(s: EditorState): EditorState {
  return { ...s, anchor: { line: 0, col: 0 }, cursor: { line: s.lines.length - 1, col: s.lines.at(-1)!.length }, goalCol: undefined };
}

const charClass = (ch: string): 'word' | 'space' | 'punct' => {
  if (/\w/.test(ch)) return 'word';
  return /\s/.test(ch) ? 'space' : 'punct';
};

// The run of same-class characters around (line, col) — the double-click word selection. On an
// empty line the range is empty; past end of line it snaps to the last character's run.
export function wordRangeAt(lines: string[], line: number, col: number): { start: Pos; end: Pos } {
  const text = lines[line] ?? '';
  if (text.length === 0) return { start: { line, col: 0 }, end: { line, col: 0 } };
  const at = clampNumber(col, 0, text.length - 1);
  const kind = charClass(text[at]);
  let start = at;
  let end = at + 1;
  while (start > 0 && charClass(text[start - 1]) === kind) start--;
  while (end < text.length && charClass(text[end]) === kind) end++;
  return { start: { line, col: start }, end: { line, col: end } };
}
