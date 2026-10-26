import { containedAbsolute, containedPath } from '../../path-containment.js';
import {
  DESCENDANT_DESTINATION_REASON,
  failureReasons,
  LIVE_SHELL_TRANSCRIPT_REASON,
  SOURCE_UNAVAILABLE_REASON,
} from '../file-operation-result.js';
import type { FilesTabState } from '../state.js';
import type { Managers } from '../../managers.js';
import type { BatchResult, BulkMoveResult } from '../../protocol.js';
import { mapMaybe, type MaybePromise } from '../../maybe-promise.js';
import { pathsMoved } from './paths-moved.js';

function failedOperation(path: string, reason: string): BatchResult {
  return { total: 1, failedPaths: [path], ...failureReasons(new Map([[path, reason]])) };
}

// A shell transcript's writer keeps appending to the file it opened, so moving or renaming it would
// leave the shell tab's button and the live-transcript save refusal naming a path that is gone.
// Answers the refusal for a local source a writer still holds, and undefined otherwise.
export function liveTranscriptRefusal(
  managers: Managers, state: FilesTabState, relPath: string,
): BatchResult | undefined {
  if (state.remote) return undefined;
  const absolute = containedPath(state.root, relPath);
  if (!absolute || !managers.shellTranscript.isWriting(absolute)) return undefined;
  return failedOperation(relPath, LIVE_SHELL_TRANSCRIPT_REASON);
}

// A conflict answer passes straight through: nothing moved, so there is no history entry to record
// and no tree to rebuild — the client asks the user and retries with `overwrite` set.
export function moveOne(
  managers: Managers,
  state: FilesTabState,
  fromRelPath: string,
  toRelPath: string,
  rebuild: () => void,
  overwrite?: boolean,
): MaybePromise<BulkMoveResult> {
  if (containedAbsolute(fromRelPath, toRelPath)) {
    return failedOperation(fromRelPath, DESCENDANT_DESTINATION_REASON);
  }
  return mapMaybe(state.filesystem.move(state.root, fromRelPath, toRelPath, overwrite), (moved) => {
    if ('conflictPaths' in moved) return moved;
    if (!moved.ok) return failedOperation(fromRelPath, moved.reason);
    pathsMoved(managers, state, [moved.value]);
    state.undoStack.push({ entries: [moved.value] });
    state.redoStack = [];
    rebuild();
    return { total: 1, failedPaths: [] };
  });
}

export function renameOne(
  managers: Managers,
  state: FilesTabState,
  relPath: string,
  newName: string,
  rebuild: () => void,
  overwrite?: boolean,
): MaybePromise<BatchResult | { conflict: true }> {
  return mapMaybe(state.filesystem.rename(state.root, relPath, newName, overwrite), (renamed) => {
    if ('conflict' in renamed) return renamed;
    if (!renamed.ok) return failedOperation(relPath, renamed.reason);
    pathsMoved(managers, state, [{ from: renamed.value[0], to: renamed.value[1] }]);
    rebuild();
    return { total: 1, failedPaths: [] };
  });
}

export function deleteOne(
  state: FilesTabState, relPath: string, rebuild: () => void,
): MaybePromise<BatchResult> {
  return mapMaybe(state.filesystem.delete(state.root, relPath), (deleted) => {
    if (!deleted.ok) return failedOperation(relPath, deleted.reason);
    rebuild();
    return { total: 1, failedPaths: [] };
  });
}

export function unavailable(path: string): BatchResult {
  return failedOperation(path, SOURCE_UNAVAILABLE_REASON);
}
