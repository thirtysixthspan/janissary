// Applies a symbolic KeyAction (see keys.ts) to any editable surface that owns its own EditorState,
// undo buffer, and kill buffer — shared so the buffer (useEditor.ts) and the ephemeral query line
// (useEditorSuggest.ts) get identical keybinding behavior from one definition.

import type { EditorState, Pos } from './model';
import {
  insertText, deleteBackward, deleteForward, killToLineEnd,
  collapseSelection, selectAll, selectionsText,
  allSelections, hasMultipleSelections,
} from './model';
import { multiEdit, multiMove, type MultiEditKind } from './multi-caret';
import { moveCursor, movePage, moveLineEdge, moveDocumentEdge, moveToVisualTarget } from './motion';
import type { KeyAction } from './keys';
import type { UndoBuffer } from './undo';

// Resolves one visual row up/down from the caret's current screen position (wrapped-line-aware
// navigation); returns null to fall back to logical-line movement.
export type ResolveVertical = (dir: 'up' | 'down') => Pos | null;

export type EditSurface = {
  getState: () => EditorState | null;
  setState: (s: EditorState) => void;
  undo: UndoBuffer;
  kill: { text: string };
  onSave: () => void;
};

type Move = (next: EditorState) => void;
type Edit = (before: EditorState, next: EditorState, kind: Parameters<UndoBuffer['record']>[1]) => void;

function applyMove(s: EditorState, action: KeyAction, pageLines: number, move: Move, resolveVertical?: ResolveVertical): boolean {
  const many = hasMultipleSelections(s);
  const run = (one: (state: EditorState) => EditorState) => (many ? multiMove(s, one) : one(s));
  switch (action.kind) {
    case 'move': {
      // The visual (wrapped-line-aware) target is measured from the one caret that carries the DOM
      // ref, so with several carets ↑/↓ move every one of them by a logical line instead.
      if (!many && (action.dir === 'up' || action.dir === 'down')) {
        const target = resolveVertical?.(action.dir);
        if (target) { move(moveToVisualTarget(s, target, action.extend)); return true; }
      }
      move(run((one) => moveCursor(one, action.dir, action.extend)));
      return true;
    }
    case 'page': { move(run((one) => movePage(one, action.dir, pageLines, action.extend))); return true; }
    case 'lineEdge': { move(run((one) => moveLineEdge(one, action.edge, action.extend))); return true; }
    case 'docEdge': { move(run((one) => moveDocumentEdge(one, action.edge, action.extend))); return true; }
    case 'escape': { move(collapseSelection(s)); return true; }
    case 'selectAll': { move(selectAll(s)); return true; }
    case 'copy': { void navigator.clipboard.writeText(selectionsText(s)); return true; }
    default: { return false; }
  }
}

// VS Code's multi-caret paste: a clipboard whose line count matches the caret count is distributed
// one line per selection in document order, and anything else goes in whole at every selection.
// Enter's lone '\n' is never distributed — it is a line break at every caret, not two empty lines.
function textPerSelection(s: EditorState, text: string): (index: number) => string {
  const parts = text.split('\n');
  return parts.length === allSelections(s).length && text !== '\n' ? (index) => parts[index] : () => text;
}

// The three text edits, each in its multi-caret form when there is a set and its ordinary
// single-caret form otherwise — the one place that dispatch is made.
function editedState(s: EditorState, kind: MultiEditKind, text: string): EditorState {
  if (!hasMultipleSelections(s)) {
    if (kind === 'deleteBackward') return deleteBackward(s);
    return kind === 'deleteForward' ? deleteForward(s) : insertText(s, text);
  }
  return multiEdit(s, kind, kind === 'insert' ? textPerSelection(s, text) : () => '');
}

function applyTextEdit(s: EditorState, action: KeyAction, edit: Edit): boolean {
  switch (action.kind) {
    case 'insert': {
      // Single typed characters coalesce into one undo group; Enter/paste are discrete steps.
      const kind = action.text.length === 1 && action.text !== '\n' ? 'typing' : 'other';
      edit(s, editedState(s, 'insert', action.text), kind);
      return true;
    }
    case 'deleteBackward':
    case 'deleteForward': { edit(s, editedState(s, action.kind, ''), 'delete'); return true; }
    default: { return false; }
  }
}

function applyEdit(surface: EditSurface, s: EditorState, action: KeyAction, edit: Edit): void {
  if (applyTextEdit(s, action, edit)) return;
  switch (action.kind) {
    case 'kill': {
      const { state: next, killed } = killToLineEnd(s);
      if (killed) { surface.kill.text = killed; edit(s, next, 'other'); }
      break;
    }
    case 'yank': { if (surface.kill.text) edit(s, insertText(s, surface.kill.text), 'other'); break; }
    case 'cut': {
      const text = selectionsText(s);
      if (text) {
        void navigator.clipboard.writeText(text);
        edit(s, editedState(s, 'insert', ''), 'other');
      }
      break;
    }
    case 'undo': { const previous = surface.undo.undo(s); if (previous) surface.setState(previous); break; }
    case 'redo': { const next = surface.undo.redo(s); if (next) surface.setState(next); break; }
    default: { break; }
  }
}

export function applyKeyAction(surface: EditSurface, action: KeyAction, pageLines: number, resolveVertical?: ResolveVertical): void {
  const s = surface.getState();
  if (!s) return;
  if (action.kind === 'save') {
    if (hasMultipleSelections(s)) surface.setState(collapseSelection(s));
    surface.onSave();
    return;
  }

  // Cursor-only changes seal the undo coalescing group but are never undo steps themselves.
  const move: Move = (next) => { surface.undo.seal(); surface.setState(next); };
  const edit: Edit = (before, next, kind) => { surface.undo.record(before, kind); surface.setState(next); };

  if (!applyMove(s, action, pageLines, move, resolveVertical)) applyEdit(surface, s, action, edit);
}
