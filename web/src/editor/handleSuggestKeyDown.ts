import type React from 'react';
import type { EditorApi } from './useEditor';
import type { EditorSuggestApi } from './useEditorSuggest';
import type { EditorState } from './model';
import { insertText, deleteBackward, deleteForward, toText } from './model';
import { moveCursor, moveLineEdge } from './motion';
import { completePersonaName, suggestPillLabel, type SuggestPill } from './suggest-request';

// While the query line's status pill holds keyboard focus (via Tab), Enter fires the request and
// any other key (but Tab) drops focus back to plain text-editing. Returns true once it has handled
// (and prevented) the event.
function handleQueryPillFocus(e: React.KeyboardEvent, suggest: EditorSuggestApi, pill: SuggestPill | undefined, bufferState: EditorState | null): boolean {
  if (!suggest.pillFocused) return false;
  if (e.key === 'Enter') {
    e.preventDefault();
    suggest.setPillFocused(false);
    if (pill?.runnable && bufferState) suggest.fireOnLine(bufferState);
    return true;
  }
  if (e.key !== 'Tab') suggest.setPillFocused(false);
  return false;
}

// Tab completes the persona name under the caret, or — once the request is already runnable —
// focuses the status pill instead.
function handleQueryTab(e: React.KeyboardEvent, suggest: EditorSuggestApi, qs: EditorState, pill: SuggestPill | undefined): boolean {
  e.preventDefault();
  const completion = completePersonaName(qs.lines[0], qs.cursor.col, suggest.personas);
  if (completion) {
    const lineText = qs.lines[0];
    const newLine = `${lineText.slice(0, completion.start)}${completion.name} ${lineText.slice(completion.end)}`;
    const col = completion.start + completion.name.length + 1;
    suggest.setQueryLineState({ lines: [newLine, ...qs.lines.slice(1)], cursor: { line: 0, col }, anchor: null });
    return true;
  }
  if (pill?.runnable) suggest.setPillFocused(true);
  return true;
}

// The query text's editing transitions, reusing model.ts/motion.ts (Decision 2): printable keys,
// Backspace/Delete, and Left/Right/Home/End/Up/Down. Up/Down move within a multiline query
// (Shift+Enter inserts a line break, see handleQueryLineKeyDown) and, once the cursor passes the
// query's first or last line, hand focus to the buffer at the anchor's neighboring line instead
// (a no-op there when the anchor sits at the document's first/last line). Every other key is
// swallowed so it never reaches the buffer.
function handleQueryEdit(e: React.KeyboardEvent, suggest: EditorSuggestApi, qs: EditorState, bufferState: EditorState | null): boolean {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    const dir = e.key === 'ArrowUp' ? -1 : 1;
    const targetLine = qs.cursor.line + dir;
    if (targetLine >= 0 && targetLine < qs.lines.length) {
      suggest.setQueryLineState(moveCursor(qs, e.key === 'ArrowUp' ? 'up' : 'down', e.shiftKey));
    } else if (bufferState && !e.shiftKey) {
      suggest.exitQueryToBuffer(dir, qs.cursor.col, bufferState);
    }
    return true;
  }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    suggest.setQueryLineState(moveCursor(qs, e.key === 'ArrowLeft' ? 'left' : 'right', e.shiftKey));
    return true;
  }
  if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    suggest.setQueryLineState(moveLineEdge(qs, e.key === 'Home' ? 'home' : 'end', e.shiftKey));
    return true;
  }
  if (e.key === 'Backspace') { e.preventDefault(); suggest.setQueryLineState(deleteBackward(qs)); return true; }
  if (e.key === 'Delete') { e.preventDefault(); suggest.setQueryLineState(deleteForward(qs)); return true; }
  if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    suggest.setQueryLineState(insertText(qs, e.key));
    return true;
  }
  return true;
}

// Routes keydowns to the ephemeral agent query line (see product/specs/editor-tab.md "In-editor
// persona suggestions") while it is open: Enter/Ctrl/Cmd+Enter fire when runnable and are
// otherwise a no-op (Decision 7), Shift+Enter inserts a line break instead of firing; Escape
// closes with nothing inserted (Decision 5); everything else is either the pill-focus affordance,
// Tab-completion, or plain text editing.
function handleQueryLineKeyDown(e: React.KeyboardEvent, suggest: EditorSuggestApi, bufferState: EditorState | null): boolean {
  const qs = suggest.queryLine!.state;
  const pill = suggestPillLabel(toText(qs), suggest.personas, suggest.firingLine, null, suggest.noSuggestionLine);

  if (handleQueryPillFocus(e, suggest, pill, bufferState)) return true;
  if (e.key === 'Escape') { e.preventDefault(); suggest.closeQueryLine(); return true; }
  if (e.key === 'Tab') return handleQueryTab(e, suggest, qs, pill);
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.shiftKey) { suggest.setQueryLineState(insertText(qs, '\n')); return true; }
    if (pill?.runnable && bufferState) suggest.fireOnLine(bufferState);
    return true;
  }
  return handleQueryEdit(e, suggest, qs, bufferState);
}

// While the buffer holds focus and a query line is open, an ArrowUp/ArrowDown that would land the
// cursor exactly on the query's anchor line instead hands focus into the query line (entering at
// its top when moving down, its bottom when moving up), same column. Plain arrows only — a
// selection-extending or app-shortcut modifier falls through to ordinary buffer movement instead.
function crossIntoQuery(e: React.KeyboardEvent, suggest: EditorSuggestApi, s: EditorState): boolean {
  if (!suggest.queryLine || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') || e.shiftKey || e.metaKey || e.ctrlKey) return false;
  const dir = e.key === 'ArrowUp' ? -1 : 1;
  if (s.cursor.line + dir !== suggest.queryLine.anchorLine) return false;
  e.preventDefault();
  suggest.enterQueryFromBuffer(dir, s.cursor.col);
  return true;
}

// Intercepts editor keydowns for the in-editor persona-suggestion surface — blocking edits while
// any hunk is pending (resolution itself is click-only, via each hunk's accept/decline icons; see
// EditorLines.tsx), routing keys to the query line only while it holds focus (`focusTarget`) so
// the buffer stays editable while the query line remains open, crossing into the query when the
// buffer's own vertical navigation reaches its anchor line, and opening it when `>` is typed as
// the first character of an otherwise-empty line (Decision 3). Returns true once it has handled
// (and prevented) the event, so EditorTab's onKeyDown stops there. Split out to keep EditorTab.tsx
// under the 200-line cap (Decision 12).
export function handleSuggestKeyDown(e: React.KeyboardEvent, api: EditorApi, suggest: EditorSuggestApi): boolean {
  if (suggest.pending) {
    e.preventDefault();
    return true;
  }
  if (suggest.queryLine && suggest.focusTarget === 'query') return handleQueryLineKeyDown(e, suggest, api.stateRef.current);
  const s = api.stateRef.current;
  if (s && crossIntoQuery(e, suggest, s)) return true;
  if (s && e.key === '>' && !e.metaKey && !e.ctrlKey && s.cursor.col === 0 && s.lines[s.cursor.line] === '' && !s.anchor) {
    e.preventDefault();
    suggest.openQueryLine(s.cursor.line);
    return true;
  }
  return false;
}
