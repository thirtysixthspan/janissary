import { applyStackMove, type MoveGroup, type UndoRedoResult } from './moves.js';

type HistoryState = {
  root: string;
  undoStack: MoveGroup[];
  redoStack: MoveGroup[];
};

export function replayHistory(
  state: HistoryState,
  direction: 'undo' | 'redo',
  overwrite: boolean,
  skipConflicts: boolean,
  rebuild: () => void,
): UndoRedoResult {
  const fromStack = direction === 'undo' ? state.undoStack : state.redoStack;
  const toStack = direction === 'undo' ? state.redoStack : state.undoStack;
  const group = fromStack.at(-1);
  if (!group) return {};
  const result = applyStackMove(
    state.root,
    group,
    direction,
    fromStack,
    toStack,
    overwrite ? 'overwrite-all' : skipConflicts ? 'skip-conflicts' : undefined,
    rebuild,
  );
  return group.entries.length === 1 && !result.conflicts
    ? (result.conflict ? { conflict: result.conflict } : {})
    : result;
}
