// The trust boundary. A plugin's result is validated against the buffer before anything is touched:
// an edit naming a position outside the document, or two edits whose ranges overlap, cannot be
// applied meaningfully, and silently clamping or dropping one would corrupt the user's text without
// telling anyone. On any violation nothing is applied at all and the caller disables the plugin.

import type { EditorState, Pos } from '../model';
import { posBefore, samePos } from '../model';
import type { EditorPluginEdit, EditorPluginResult, EditorSelection } from './api';

export type ApplyOutcome =
  | { ok: true; state: EditorState }
  | { ok: false; reason: string };

function positionFault(lines: readonly string[], position: Pos, label: string): string | null {
  if (!Number.isSafeInteger(position.line) || !Number.isSafeInteger(position.col)) {
    return `${label} is not an integer position`;
  }
  if (position.line < 0 || position.line >= lines.length) {
    return `${label} names line ${position.line}, outside a ${lines.length}-line document`;
  }
  const width = lines[position.line].length;
  if (position.col < 0 || position.col > width) {
    return `${label} names column ${position.col}, outside a ${width}-character line`;
  }
  return null;
}

function editFault(lines: readonly string[], edit: EditorPluginEdit, index: number): string | null {
  const start = positionFault(lines, edit.start, `edit ${index} start`);
  if (start !== null) return start;
  const end = positionFault(lines, edit.end, `edit ${index} end`);
  if (end !== null) return end;
  if (posBefore(edit.end, edit.start)) return `edit ${index} ends before it starts`;
  return null;
}

function selectionFault(lines: readonly string[], selection: EditorSelection): string | null {
  const cursor = positionFault(lines, selection.cursor, 'selection cursor');
  if (cursor !== null) return cursor;
  if (selection.anchor === null) return null;
  return positionFault(lines, selection.anchor, 'selection anchor');
}

// Ranges that merely touch at a boundary are fine; ranges that share any interior are not.
function overlapFault(sorted: readonly EditorPluginEdit[]): string | null {
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1];
    const current = sorted[index];
    if (posBefore(current.start, previous.end)) return 'two edits cover overlapping ranges';
  }
  return null;
}

function replaceRange(lines: readonly string[], edit: EditorPluginEdit): string[] {
  const head = lines[edit.start.line].slice(0, edit.start.col);
  const tail = lines[edit.end.line].slice(edit.end.col);
  const middle = `${head}${edit.text}${tail}`.split('\n');
  return [...lines.slice(0, edit.start.line), ...middle, ...lines.slice(edit.end.line + 1)];
}

// Applied from the end of the document backwards so an earlier edit never shifts a later edit's
// coordinates — which is what lets every position in a result stay absolute.
export function applyPluginResult(state: EditorState, result: EditorPluginResult): ApplyOutcome {
  const sorted = result.edits.toSorted((a, b) => (
    a.start.line - b.start.line || a.start.col - b.start.col
  ));

  for (const [index, edit] of sorted.entries()) {
    const fault = editFault(state.lines, edit, index);
    if (fault !== null) return { ok: false, reason: fault };
  }
  const overlap = overlapFault(sorted);
  if (overlap !== null) return { ok: false, reason: overlap };

  let lines: readonly string[] = state.lines;
  for (const edit of sorted.toReversed()) lines = replaceRange(lines, edit);

  const next: EditorState = { ...state, lines: [...lines] };
  if (!result.selection) return { ok: true, state: next };

  // Checked against the edited lines, not the original: a returned selection describes where the
  // caret should sit *after* the edits, which is routinely past the old line's end.
  const fault = selectionFault(next.lines, result.selection);
  if (fault !== null) return { ok: false, reason: fault };

  const { anchor, cursor } = result.selection;
  return {
    ok: true,
    state: {
      ...next,
      cursor,
      anchor: anchor !== null && !samePos(anchor, cursor) ? anchor : null,
      goalCol: undefined,
    },
  };
}
