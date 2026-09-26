// The commenting transform: given the whole lines the request covered and the syntax for the file's
// language, produce the edits and where to leave the selection. Pure — every rule commenting has
// lives here and in the two strategy modules beside it.

import {
  primarySelection,
  selectionAfterLineEdits,
  type EditorPluginRequest,
  type EditorPluginResult,
} from '../api';
import { toggleBlockComment } from './block-comment';
import { toggleLineComments } from './line-comment';
import type { CommentSyntax } from './syntax';

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

  const caret = primarySelection(request).cursor;
  const onCaretLine = toggled.edits.filter(
    (edit) => edit.start.line === caret.line && edit.start.col <= caret.col,
  );
  const caretShift = onCaretLine.reduce(
    (total, edit) => total + edit.text.length - (edit.end.col - edit.start.col), 0,
  );

  return {
    edits: toggled.edits,
    selections: selectionAfterLineEdits(request, lastLine, toggled.lastLineWidth, caretShift),
  };
}
