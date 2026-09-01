import { clearFilesystemCache } from './filesystem-cache.js';
import { deleteMany, moveMany, pasteMany } from './manager-batch.js';
import { createNavigatorDirectory } from './manager-files.js';
import { replayHistory } from './manager-history.js';
import { deleteOne, moveOne, renameOne, unavailable } from './manager-item-operations.js';
import { withFilesState } from './manager-state.js';
import type { FilesTabState } from './state.js';
import type { MaybePromise } from '../maybe-promise.js';
import type { Managers } from '../managers.js';
import type { BatchResult, BulkConflictPolicy, BulkMoveResult, UndoRedoResult } from '../protocol.js';

// The manager internals every mutating operation needs, handed over as one value so the manager's
// own `rebuild` stays private — it is reachable here only through the bound closure it puts on this.
export type MutationContext = {
  managers: Managers;
  tabs: Map<string, FilesTabState>;
  rebuild: (label: string) => void;
};

// What a bulk operation reports when the tab it names is not an open navigator. A fresh object per
// call, never a shared constant — callers own the result and its `failedPaths` array.
function nothingMutated(): BatchResult {
  return { total: 0, failedPaths: [] };
}

// The callback every mutating operation hands its worker: a mutation invalidates every cached
// listing and stat this tab holds, so the cache is emptied before the tree is redrawn — a rebuild
// over the stale cache would repaint the sizes and timestamps of files that just moved or went
// away. Any operation added to this module must pass this rather than a bare rebuild.
function afterMutation(context: MutationContext, label: string, state: FilesTabState): () => void {
  return () => { clearFilesystemCache(state); context.rebuild(label); };
}

export function moveItem(
  context: MutationContext, label: string, fromRelPath: string, toRelPath: string,
): MaybePromise<BatchResult> {
  return withFilesState(context.tabs, label, unavailable(fromRelPath), (state) => moveOne(
    state, fromRelPath, toRelPath, afterMutation(context, label, state),
  ));
}

export function moveItems(
  context: MutationContext,
  label: string,
  sourcePaths: string[],
  destinationPath: string,
  policy?: BulkConflictPolicy,
): MaybePromise<BulkMoveResult> {
  return withFilesState(context.tabs, label, nothingMutated(), (state) => moveMany(
    state, sourcePaths, destinationPath, policy, afterMutation(context, label, state),
  ));
}

export function deleteItems(
  context: MutationContext, label: string, sourcePaths: string[],
): MaybePromise<BatchResult> {
  return withFilesState(context.tabs, label, nothingMutated(), (state) => deleteMany(
    state, sourcePaths, afterMutation(context, label, state),
  ));
}

export function pasteItems(
  context: MutationContext,
  label: string,
  sources: string[],
  destinationPath: string,
  mode: 'copy' | 'cut',
  policy?: BulkConflictPolicy,
  sourceHost?: string,
): MaybePromise<BulkMoveResult> {
  return withFilesState(context.tabs, label, nothingMutated(), (state) => pasteMany(
    state, sources, destinationPath, mode, policy, afterMutation(context, label, state), sourceHost,
  ));
}

export function replayMutation(
  context: MutationContext,
  label: string,
  direction: 'undo' | 'redo',
  overwrite: boolean,
  skipConflicts: boolean,
): MaybePromise<UndoRedoResult> {
  return withFilesState(context.tabs, label, {}, (state) => replayHistory(
    state, direction, overwrite, skipConflicts, afterMutation(context, label, state),
  ));
}

export function renameItem(
  context: MutationContext, label: string, relPath: string, newName: string,
): MaybePromise<BatchResult> {
  return withFilesState(context.tabs, label, unavailable(relPath), (state) => renameOne(
    context.managers, state, relPath, newName, afterMutation(context, label, state),
  ));
}

export function deleteItem(
  context: MutationContext, label: string, relPath: string,
): MaybePromise<BatchResult> {
  return withFilesState(context.tabs, label, unavailable(relPath), (state) => deleteOne(
    state, relPath, afterMutation(context, label, state),
  ));
}

export function createDirectoryIn(
  context: MutationContext, label: string, destination: string,
): MaybePromise<string | undefined> {
  return withFilesState(context.tabs, label, undefined, (state) => createNavigatorDirectory(
    context.managers, state, label, destination, afterMutation(context, label, state),
  ));
}
