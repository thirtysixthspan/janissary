// The commenting transform: given the whole lines the request covered and the syntax for the file's
// language, produce the edits and where to leave the selection. Pure — every rule commenting has
// lives here and in the two strategy modules beside it.

import type { EditorPluginRequest, EditorPluginResult } from '../api';
import { toggleBlockComment } from './block-comment';
import { toggleLineComments } from './line-comment';
import type { CommentSyntax } from './syntax';

// The selection follows the toggle so a second press is the exact inverse of the first: a range
// selection keeps covering the same whole lines, while a bare caret stays on its line and shifts by
// the width of what was inserted or removed on it.
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

export function toggleComments(
  request: EditorPluginRequest, syntax: CommentSyntax,
): EditorPluginResult | null {
  const lines = request.lines;
  if (lines.length === 0) return null;

  const baseLine = request.range.start.line;
  const lastLine = baseLine + lines.length - 1;
  const toggled = syntax.kind === 'line'
    ? toggleLineComments(lines, baseLine, syntax.marker)
    : toggleBlockComment(lines, baseLine, syntax.open, syntax.close);

  if (toggled.edits.length === 0) return null;

  const onCaretLine = toggled.edits.filter(
    (edit) => edit.start.line === request.selection.cursor.line
      && edit.start.col <= request.selection.cursor.col,
  );
  const caretShift = onCaretLine.reduce(
    (total, edit) => total + edit.text.length - (edit.end.col - edit.start.col), 0,
  );

  return {
    edits: toggled.edits,
    selection: selectionFor(request, lastLine, toggled.lastLineWidth, caretShift),
  };
}
