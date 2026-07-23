// Applies a symbolic KeyAction (see keys.ts) to any editable surface that owns its own EditorState,
// undo buffer, and kill buffer — shared so the buffer (useEditor.ts) and the ephemeral query line
// (useEditorSuggest.ts) get identical keybinding behavior from one definition.

import type { EditorState, Pos } from './model';
import {
  insertText, deleteBackward, deleteForward, killToLineEnd,
  collapseSelection, selectAll, selectedText,
} from './model';
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
  switch (action.kind) {
    case 'move': {
      if (action.dir === 'up' || action.dir === 'down') {
        const target = resolveVertical?.(action.dir);
        if (target) { move(moveToVisualTarget(s, target, action.extend)); return true; }
      }
      move(moveCursor(s, action.dir, action.extend));
      return true;
    }
    case 'page': { move(movePage(s, action.dir, pageLines, action.extend)); return true; }
    case 'lineEdge': { move(moveLineEdge(s, action.edge, action.extend)); return true; }
    case 'docEdge': { move(moveDocumentEdge(s, action.edge, action.extend)); return true; }
    case 'escape': { move(collapseSelection(s)); return true; }
    case 'selectAll': { move(selectAll(s)); return true; }
    case 'copy': { void navigator.clipboard.writeText(selectedText(s)); return true; }
    default: { return false; }
  }
}

function applyEdit(surface: EditSurface, s: EditorState, action: KeyAction, edit: Edit): void {
  switch (action.kind) {
    case 'insert': {
      // Single typed characters coalesce into one undo group; Enter/paste are discrete steps.
      edit(s, insertText(s, action.text), action.text.length === 1 && action.text !== '\n' ? 'typing' : 'other');
      break;
    }
    case 'deleteBackward': { edit(s, deleteBackward(s), 'delete'); break; }
    case 'deleteForward': { edit(s, deleteForward(s), 'delete'); break; }
    case 'kill': {
      const { state: next, killed } = killToLineEnd(s);
      if (killed) { surface.kill.text = killed; edit(s, next, 'other'); }
      break;
    }
    case 'yank': { if (surface.kill.text) edit(s, insertText(s, surface.kill.text), 'other'); break; }
    case 'cut': {
      const text = selectedText(s);
      if (text) { void navigator.clipboard.writeText(text); edit(s, insertText(s, ''), 'other'); }
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
  if (action.kind === 'save') { surface.onSave(); return; }

  // Cursor-only changes seal the undo coalescing group but are never undo steps themselves.
  const move: Move = (next) => { surface.undo.seal(); surface.setState(next); };
  const edit: Edit = (before, next, kind) => { surface.undo.record(before, kind); surface.setState(next); };

  if (!applyMove(s, action, pageLines, move, resolveVertical)) applyEdit(surface, s, action, edit);
}
