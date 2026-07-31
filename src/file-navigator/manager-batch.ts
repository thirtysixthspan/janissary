import { deleteBatch, moveBatch } from './batch.js';
import { pasteBatch } from './paste.js';
import type { HistoryStep } from './moves.js';
import type { BatchResult, BulkConflictPolicy, BulkMoveResult } from '../protocol.js';

type BatchState = {
  root: string;
  undoStack: HistoryStep[];
  redoStack: HistoryStep[];
};

export function moveMany(
  state: BatchState,
  sourcePaths: string[],
  destinationPath: string,
  policy: BulkConflictPolicy | undefined,
  rebuild: () => void,
): BulkMoveResult {
  const result = moveBatch(state.root, sourcePaths, destinationPath, policy);
  if ('conflictPaths' in result) return result;
  if (result.moved.length > 0) {
    state.undoStack.push({ entries: result.moved });
    state.redoStack = [];
  }
  if (result.mutated) rebuild();
  return { total: result.total, failedPaths: result.failedPaths };
}

export function deleteMany(
  state: BatchState,
  sourcePaths: string[],
  rebuild: () => void,
): BatchResult {
  const result = deleteBatch(state.root, sourcePaths);
  if (result.mutated) rebuild();
  return { total: result.total, failedPaths: result.failedPaths };
}

export function pasteMany(
  state: BatchState,
  sources: string[],
  destinationPath: string,
  mode: 'copy' | 'cut',
  policy: BulkConflictPolicy | undefined,
  rebuild: () => void,
): BulkMoveResult {
  const result = pasteBatch(state.root, sources, destinationPath, mode, policy);
  if ('conflictPaths' in result) return result;
  if (result.pairs.length > 0) {
    state.undoStack.push({ mode, pairs: result.pairs });
    state.redoStack = [];
  }
  if (result.mutated) rebuild();
  return { total: result.total, failedPaths: result.failedPaths };
}
