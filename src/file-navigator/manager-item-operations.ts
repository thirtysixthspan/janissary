import { isSameOrDescendantPath } from './index.js';
import {
  DESCENDANT_DESTINATION_REASON,
  failureReasons,
  SOURCE_UNAVAILABLE_REASON,
} from './file-operation-result.js';
import type { FilesTabState } from './state.js';
import type { Managers } from '../managers.js';
import type { BatchResult } from '../protocol.js';
import { mapMaybe, type MaybePromise } from '../maybe-promise.js';

function failedOperation(path: string, reason: string): BatchResult {
  return { total: 1, failedPaths: [path], ...failureReasons(new Map([[path, reason]])) };
}

export function moveOne(
  state: FilesTabState,
  fromRelPath: string,
  toRelPath: string,
  rebuild: () => void,
): MaybePromise<BatchResult> {
  if (isSameOrDescendantPath(toRelPath, fromRelPath)) {
    return failedOperation(fromRelPath, DESCENDANT_DESTINATION_REASON);
  }
  return mapMaybe(state.filesystem.move(state.root, fromRelPath, toRelPath), (moved) => {
    if (!moved.ok) return failedOperation(fromRelPath, moved.reason);
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
): MaybePromise<BatchResult> {
  return mapMaybe(state.filesystem.rename(state.root, relPath, newName), (renamed) => {
    if (!renamed.ok) return failedOperation(relPath, renamed.reason);
    if (!state.remote) {
      const [oldAbs, newAbs] = renamed.value;
      managers.tab.retargetEditorTab(oldAbs, newAbs);
    }
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
