import { applyStackMove, applyStackPaste, isPasteGroup, type HistoryStep } from './moves.js';
import type { UndoRedoResult } from '../protocol.js';

type HistoryState = {
  root: string;
  undoStack: HistoryStep[];
  redoStack: HistoryStep[];
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
  const step = fromStack.at(-1);
  if (!step) return {};
  const policy = overwrite ? 'overwrite-all' : skipConflicts ? 'skip-conflicts' : undefined;
  if (isPasteGroup(step)) {
    return applyStackPaste(step, direction, fromStack, toStack, policy, rebuild);
  }
  const result = applyStackMove(state.root, step, direction, fromStack, toStack, policy, rebuild);
  // Single-entry collapsing (dropping the `total`/`failedPaths` envelope back to the older bare
  // `{}`/`{conflict}` shape) applies to move steps only — a paste step always returns the full
  // `BatchResult` shape, matching the batch-move RPC's own reply.
  return step.entries.length === 1 && !result.conflicts
    ? (result.conflict ? { conflict: result.conflict } : {})
    : result;
}
