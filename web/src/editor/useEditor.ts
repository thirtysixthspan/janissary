// Editor state container: owns the EditorState, undo buffer, and kill buffer, and applies
// symbolic key actions to them. Event handlers read `stateRef` (events fire outside render, so
// the ref mirror is always current) and never mutate inside a React updater.

import { useRef, useState } from 'react';
import type { EditorState, Pos } from './model';
import {
  fromText, insertText, deleteBackward, deleteForward, killToLineEnd,
  collapseSelection, selectAll, selectedText,
} from './model';
import { moveCursor, movePage, moveLineEdge, moveDocumentEdge, moveToVisualTarget } from './motion';
import type { KeyAction } from './keys';
import { UndoBuffer, type EditKind } from './undo';

// Resolves one visual row up/down from the caret's current screen position (wrapped-line-aware
// navigation); returns null to fall back to logical-line movement.
export type ResolveVertical = (dir: 'up' | 'down') => Pos | null;

export type EditorApi = {
  state: EditorState | null;
  stateRef: React.RefObject<EditorState | null>;
  load: (text: string, line?: number) => void;
  setState: (s: EditorState) => void;
  insert: (text: string) => void;
  apply: (action: KeyAction, pageLines: number, resolveVertical?: ResolveVertical) => void;
  sealUndo: () => void;
};

export function useEditor(onSave: () => void): EditorApi {
  const [state, setStateRaw] = useState<EditorState | null>(null);
  const stateRef = useRef<EditorState | null>(null);
  const undo = useRef(new UndoBuffer()).current;
  const kill = useRef({ text: '' }).current;

  const setState = (s: EditorState) => { stateRef.current = s; setStateRaw(s); };
  const load = (text: string, line?: number) => { setState(fromText(text, line)); };
  // Cursor-only changes seal the undo coalescing group but are never undo steps themselves.
  const move = (s: EditorState) => { undo.seal(); setState(s); };
  const edit = (before: EditorState, next: EditorState, kind: EditKind) => { undo.record(before, kind); setState(next); };

  const insert = (text: string) => {
    const s = stateRef.current;
    if (!s) return;
    // Single typed characters coalesce into one undo group; Enter/paste are discrete steps.
    edit(s, insertText(s, text), text.length === 1 && text !== '\n' ? 'typing' : 'other');
  };

  const applyEdit = (s: EditorState, action: KeyAction): void => {
    switch (action.kind) {
      case 'insert': { insert(action.text); break; }
      case 'deleteBackward': { edit(s, deleteBackward(s), 'delete'); break; }
      case 'deleteForward': { edit(s, deleteForward(s), 'delete'); break; }
      case 'kill': {
        const { state: next, killed } = killToLineEnd(s);
        if (killed) { kill.text = killed; edit(s, next, 'other'); }
        break;
      }
      case 'yank': { if (kill.text) { edit(s, insertText(s, kill.text), 'other'); } break; }
      case 'cut': {
        const text = selectedText(s);
        if (text) { void navigator.clipboard.writeText(text); edit(s, insertText(s, ''), 'other'); }
        break;
      }
      case 'undo': { const previous = undo.undo(s); if (previous) setState(previous); break; }
      case 'redo': { const next = undo.redo(s); if (next) setState(next); break; }
      default: { break; }
    }
  };

  const apply = (action: KeyAction, pageLines: number, resolveVertical?: ResolveVertical): void => {
    const s = stateRef.current;
    if (!s) return;
    switch (action.kind) {
      case 'move': {
        if (action.dir === 'up' || action.dir === 'down') {
          const target = resolveVertical?.(action.dir);
          if (target) { move(moveToVisualTarget(s, target, action.extend)); break; }
        }
        move(moveCursor(s, action.dir, action.extend));
        break;
      }
      case 'page': { move(movePage(s, action.dir, pageLines, action.extend)); break; }
      case 'lineEdge': { move(moveLineEdge(s, action.edge, action.extend)); break; }
      case 'docEdge': { move(moveDocumentEdge(s, action.edge, action.extend)); break; }
      case 'escape': { move(collapseSelection(s)); break; }
      case 'selectAll': { move(selectAll(s)); break; }
      case 'copy': { void navigator.clipboard.writeText(selectedText(s)); break; }
      case 'save': { onSave(); break; }
      default: { applyEdit(s, action); break; }
    }
  };

  return { state, stateRef, load, setState, insert, apply, sealUndo: () => undo.seal() };
}
