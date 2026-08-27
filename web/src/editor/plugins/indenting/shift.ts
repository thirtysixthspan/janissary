// The indenting transform: given the whole lines the request covered and a direction, produce the
// edits and where to leave the selection. Pure — every rule indenting has lives here, and none of
// them looks at the file's name, because indentation is not a language feature in this editor.

import type { EditorPluginEdit, EditorPluginRequest, EditorPluginResult } from '../api';

export type ShiftDirection = 'indent' | 'outdent';

const INDENT = '  ';

const BLANK = /^\s*$/u;

const isBlank = (line: string): boolean => BLANK.test(line);

const indentWidth = (line: string): number => line.length - line.trimStart().length;

// A leading tab becomes two spaces, so one tab reads as one indent level and a shifted line never
// ends up with a mix the user cannot then shift back. Tabs past the first non-whitespace character
// are not leading whitespace and are never touched.
const expandTabs = (indent: string): string => indent.split('\t').join(INDENT);

// Indent always adds a level. Outdent removes whatever is there, up to a level: a line with one
// leading space loses that space rather than refusing to move, so a ragged block still shifts.
function shifted(indent: string, direction: ShiftDirection): string {
  if (direction === 'indent') return `${INDENT}${indent}`;
  return indent.slice(Math.min(INDENT.length, indent.length));
}

// Replaces the line's leading-whitespace range with its new leading whitespace. A blank or
// whitespace-only line is skipped entirely — indenting one would add invisible trailing whitespace —
// and a line whose whitespace comes out unchanged contributes no edit at all.
function editFor(line: string, lineNumber: number, direction: ShiftDirection): EditorPluginEdit | null {
  if (isBlank(line)) return null;
  const width = indentWidth(line);
  const current = line.slice(0, width);
  const next = shifted(expandTabs(current), direction);
  if (next === current) return null;
  return { start: { line: lineNumber, col: 0 }, end: { line: lineNumber, col: width }, text: next };
}

// The selection follows the shift so a second press in the other direction is its inverse: a range
// selection keeps covering the same whole lines, while a bare caret stays on its line and moves by
// however much that line's own indentation moved.
function selectionFor(
  request: EditorPluginRequest, lastLine: number, lastLineWidth: number, caretShift: number,
): EditorPluginResult['selection'] {
  if (request.selection.anchor === null) {
    const { line, col } = request.selection.cursor;
    return { anchor: null, cursor: { line, col: Math.max(0, Math.min(col + caretShift, lastLineWidth)) } };
  }
  return {
    anchor: { line: request.range.start.line, col: 0 },
    cursor: { line: lastLine, col: lastLineWidth },
  };
}

export function shiftLines(
  request: EditorPluginRequest, direction: ShiftDirection,
): EditorPluginResult | null {
  const lines = request.lines;
  if (lines.length === 0) return null;

  const baseLine = request.range.start.line;
  const lastLine = baseLine + lines.length - 1;
  const edits: EditorPluginEdit[] = [];
  let lastLineWidth = (lines.at(-1) ?? '').length;
  let caretShift = 0;

  for (const [offset, line] of lines.entries()) {
    const lineNumber = baseLine + offset;
    const edit = editFor(line, lineNumber, direction);
    if (!edit) continue;
    edits.push(edit);
    const delta = edit.text.length - edit.end.col;
    if (offset === lines.length - 1) lastLineWidth = line.length + delta;
    if (lineNumber === request.selection.cursor.line) caretShift = delta;
  }

  if (edits.length === 0) return null;

  return { edits, selection: selectionFor(request, lastLine, lastLineWidth, caretShift) };
}
