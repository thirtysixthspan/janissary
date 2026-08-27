// The editor's document/cursor/selection state and its pure editing transitions. Movement
// transitions live in ./motion.ts; both are exercised directly by model.test.ts.

export type Pos = { line: number; col: number };

// One selection of the editor's set. The primary selection lives on EditorState's own
// cursor/anchor/goalCol fields; any others sit in `extraSelections` (see ./multi-caret.ts).
export type Selection = { anchor: Pos | null; cursor: Pos; goalCol?: number };

export type EditorState = {
  lines: string[];
  cursor: Pos;
  // Selection anchor; null = no selection. The selection spans anchor..cursor in either order.
  anchor: Pos | null;
  // Preferred column for vertical movement across short lines; set by up/down, cleared otherwise.
  goalCol?: number;
  // Selections other than the primary, in creation order — the primary is conceptually last, so the
  // most recently added caret is always the one the cursor/anchor fields describe. Absent or empty
  // means the ordinary single-caret editor, which is every state any single-caret transform builds.
  extraSelections?: readonly Selection[];
};

const clampNumber = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export const fromText = (text: string, line?: number): EditorState => {
  const lines = text.split('\n');
  const cursorLine = line === undefined ? 0 : clampNumber(line, 0, lines.length - 1);
  return { lines, cursor: { line: cursorLine, col: 0 }, anchor: null };
};

export const toText = (s: EditorState): string => s.lines.join('\n');

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

export function textIn(lines: readonly string[], r: { start: Pos; end: Pos }): string {
  if (r.start.line === r.end.line) return lines[r.start.line].slice(r.start.col, r.end.col);
  return [
    lines[r.start.line].slice(r.start.col),
    ...lines.slice(r.start.line + 1, r.end.line),
    lines[r.end.line].slice(0, r.end.col),
  ].join('\n');
}

export function selectedText(s: EditorState): string {
  const r = selectionRange(s);
  return r ? textIn(s.lines, r) : '';
}

// The ordered endpoints of any selection, empty (start === end) when it has no anchor.
export function selectionBounds(sel: Selection): { start: Pos; end: Pos } {
  if (!sel.anchor || samePos(sel.anchor, sel.cursor)) return { start: sel.cursor, end: sel.cursor };
  return posBefore(sel.anchor, sel.cursor)
    ? { start: sel.anchor, end: sel.cursor }
    : { start: sel.cursor, end: sel.anchor };
}

export const hasMultipleSelections = (s: EditorState): boolean => (s.extraSelections?.length ?? 0) > 0;

// Every selection in creation order, the primary last.
export function allSelections(s: EditorState): Selection[] {
  return [...(s.extraSelections ?? []), { anchor: s.anchor, cursor: s.cursor, goalCol: s.goalCol }];
}

// Every selection in document order — what rendering, the clipboard, and multi-caret edits read.
export function orderedSelections(s: EditorState): Selection[] {
  return allSelections(s).toSorted((a, b) => {
    const [x, y] = [selectionBounds(a).start, selectionBounds(b).start];
    return x.line - y.line || x.col - y.col;
  });
}

const selectionKey = (sel: Selection): string => {
  const { start, end } = selectionBounds(sel);
  return `${start.line}:${start.col}-${end.line}:${end.col}`;
};

// Two selections covering the same range are one caret. The last occurrence wins so the primary,
// which is always last, survives converging onto an older selection.
export function mergeSelections(list: readonly Selection[]): Selection[] {
  const seen = new Set<string>();
  const out: Selection[] = [];
  for (const sel of list.toReversed()) {
    const key = selectionKey(sel);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(sel);
  }
  return out.toReversed();
}

// Replace the whole set from a creation-ordered list whose last entry becomes the primary.
export function withSelections(s: EditorState, list: readonly Selection[]): EditorState {
  const merged = mergeSelections(list);
  const primary = merged.at(-1)!;
  return {
    ...s,
    extraSelections: merged.slice(0, -1),
    anchor: primary.anchor,
    cursor: primary.cursor,
    goalCol: primary.goalCol,
  };
}

// Each selection's text in document order, joined by newlines — the clipboard's view of the set.
export function selectionsText(s: EditorState): string {
  return orderedSelections(s).map((sel) => textIn(s.lines, selectionBounds(sel))).join('\n');
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

// Each of the three drops the whole selection set, not just the primary's anchor: every mouse
// gesture funnels through setSelection, Escape through collapseSelection, and Cmd+A through
// selectAll, and all three mean "one caret, here".
export function setSelection(s: EditorState, anchor: Pos, cursor: Pos): EditorState {
  return {
    ...s, anchor: clampPos(s.lines, anchor), cursor: clampPos(s.lines, cursor),
    goalCol: undefined, extraSelections: undefined,
  };
}

export function collapseSelection(s: EditorState): EditorState {
  return { ...s, anchor: null, extraSelections: undefined };
}

export function selectAll(s: EditorState): EditorState {
  return {
    ...s, anchor: { line: 0, col: 0 }, cursor: { line: s.lines.length - 1, col: s.lines.at(-1)!.length },
    goalCol: undefined, extraSelections: undefined,
  };
}

const charClass = (ch: string): 'word' | 'space' | 'punct' => {
  if (/\w/.test(ch)) return 'word';
  return /\s/.test(ch) ? 'space' : 'punct';
};

// The run of same-class characters around (line, col) — the double-click word selection. On an
// empty line the range is empty; past end of line it snaps to the last character's run.
export function wordRangeAt(lines: readonly string[], line: number, col: number): { start: Pos; end: Pos } {
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
