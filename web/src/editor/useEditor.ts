// Editor state container: owns the EditorState, undo buffer, and kill buffer, and applies
// symbolic key actions to them via the shared applyKeyAction (see ./applyKeyAction.ts). Event
// handlers read `stateRef` (events fire outside render, so the ref mirror is always current) and
// never mutate inside a React updater.

import { useRef, useState } from 'react';
import type { EditorState } from './model';
import { fromText } from './model';
import type { KeyAction } from './keys';
import { UndoBuffer } from './undo';
import { applyKeyAction, type EditSurface, type ResolveVertical } from './applyKeyAction';
export type { ResolveVertical } from './applyKeyAction';

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

  const surface: EditSurface = { getState: () => stateRef.current, setState, undo, kill, onSave };

  const insert = (text: string) => applyKeyAction(surface, { kind: 'insert', text }, 0);
  const apply = (action: KeyAction, pageLines: number, resolveVertical?: ResolveVertical) => {
    applyKeyAction(surface, action, pageLines, resolveVertical);
  };

  return { state, stateRef, load, setState, insert, apply, sealUndo: () => undo.seal() };
}
