// The multiselect editor plugin. Lazily imported the first time Cmd+D is pressed, so nothing here
// is fetched in a session that never multi-selects. It changes selections and never text: every
// command answers with an empty edit list and a new selection set, which is exactly the reach the
// version-2 contract gives a command.

import {
  primarySelection, selectionBounds, textIn, wordRangeAt, offsetToPos, posToOffset,
  type EditorPluginHandler, type EditorPluginRequest, type EditorPluginResult, type EditorSelection,
} from '../api';
import { nextOccurrence, type OffsetRange } from './occurrences';

const selectionsOnly = (selections: readonly EditorSelection[]): EditorPluginResult => ({ edits: [], selections });

const takenRanges = (lines: readonly string[], selections: readonly EditorSelection[]): OffsetRange[] => (
  selections.map((selection) => {
    const bounds = selectionBounds(selection);
    return { start: posToOffset(lines, bounds.start), end: posToOffset(lines, bounds.end) };
  })
);

// With nothing selected the first press expands to the word under the caret — the same run of
// same-class characters a double click selects — and the press after that starts finding it.
function expandToWord(request: EditorPluginRequest): EditorPluginResult | null {
  const { cursor } = primarySelection(request);
  const range = wordRangeAt(request.lines, cursor.line, cursor.col);
  if (range.start.col === range.end.col) return null;
  return selectionsOnly([
    ...request.selections.slice(0, -1),
    { anchor: range.start, cursor: range.end },
  ]);
}

function selectNextOccurrence(request: EditorPluginRequest): EditorPluginResult | null {
  const primary = primarySelection(request);
  const bounds = selectionBounds(primary);
  if (bounds.start.line === bounds.end.line && bounds.start.col === bounds.end.col) return expandToWord(request);

  const lines = request.lines;
  const term = textIn(lines, bounds);
  const taken = takenRanges(lines, request.selections);
  const found = nextOccurrence(lines.join('\n'), term, posToOffset(lines, bounds.end), taken);
  if (found === null) return null;

  return selectionsOnly([
    ...request.selections,
    { anchor: offsetToPos(lines, found), cursor: offsetToPos(lines, found + term.length) },
  ]);
}

// Both of these answer null when there is only one selection: there is nothing to drop and nothing
// to collapse, and a null answer is the family's silent no-op — Escape then falls through to the
// editor's own action exactly as it does when no plugin claims the chord.
function dropLastSelection(request: EditorPluginRequest): EditorPluginResult | null {
  return request.selections.length > 1 ? selectionsOnly(request.selections.slice(0, -1)) : null;
}

function collapseSelections(request: EditorPluginRequest): EditorPluginResult | null {
  return request.selections.length > 1 ? selectionsOnly([primarySelection(request)]) : null;
}

const run: EditorPluginHandler = (request) => {
  switch (request.command) {
    case 'select-next-occurrence': { return selectNextOccurrence(request); }
    case 'drop-last-selection': { return dropLastSelection(request); }
    case 'collapse-selections': { return collapseSelections(request); }
    default: { return null; }
  }
};

export default run;
