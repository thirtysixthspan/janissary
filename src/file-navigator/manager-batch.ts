import { deleteBatch, moveBatch } from './batch.js';
import type { MoveGroup } from './moves.js';
import type { BatchResult, BulkConflictPolicy, BulkMoveResult } from '../protocol.js';

type BatchState = {
  root: string;
  undoStack: MoveGroup[];
  redoStack: MoveGroup[];
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
