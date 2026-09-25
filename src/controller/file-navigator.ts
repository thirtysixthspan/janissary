// Controller-facing wrappers for file navigator tab RPCs: resolve the tab index to its label (or,
// for the mutating requests that arrive by label, check it is still open), then delegate to
// `FileNavigatorManager`. Extracted from `controller.ts` to keep it under the file-size
// limit — see `ai/guidelines/code-guidelines.md`.
import { reportOperationFailure } from '../file-navigator/operation-report.js';
import type { Managers } from '../managers.js';
import type { BatchResult, BulkConflictPolicy, BulkMoveResult, FileNavigatorDetail, FileOpenerChoice, FileOpenerResolution } from '../protocol.js';
export { fileNavigatorSelectionAction, runFileNavigatorSelectionAction } from './file-navigator-selection.js';
export { fileNavigatorCommit, fileNavigatorNothingToCommit } from './file-navigator-commit.js';
import { mapMaybe, type MaybePromise } from '../maybe-promise.js';

type HistoryReplayResult = {
  total?: number;
  failedPaths?: string[];
  failureReasons?: Record<string, string>;
  conflict?: unknown;
  conflicts?: unknown;
};

export function fileNavigatorToggle(managers: Managers, index: number, path: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.toggle(label, path);
}

export function fileNavigatorCollapseAll(managers: Managers, index: number): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.collapseAll(label);
}

export function fileNavigatorPull(managers: Managers, index: number): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.pull(label);
}

export function fileNavigatorSetDetail(managers: Managers, index: number, details: FileNavigatorDetail): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.setDetail(label, details);
}

export function fileNavigatorReroot(managers: Managers, index: number, relPath?: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.reroot(label, relPath);
}

// The mutating requests below arrive addressed by label rather than tab index, so a tab closing
// ahead of the navigator cannot redirect them. A label no open tab carries is a navigator that
// closed while the request was in flight: it mutates nothing and, like an out-of-range index
// before it, reports nothing.
function isOpenTab(managers: Managers, label: string): boolean {
  return managers.tab.tabs.some((tab) => tab.label === label);
}

// A conflict answer is returned for the client to confirm, not reported: nothing failed, the move
// is waiting on the user's say-so to replace what is already there.
export function moveFileNavigatorItem(
  managers: Managers, label: string, fromRelPath: string, toRelPath: string, overwrite?: boolean,
): MaybePromise<BulkMoveResult> {
  if (!isOpenTab(managers, label)) return { total: 0, failedPaths: [] };
  return mapMaybe(managers.fileNavigator.move(label, fromRelPath, toRelPath, overwrite), (result) => {
    if (!('conflictPaths' in result)) reportOperationFailure(managers, label, 'move', result);
    return result;
  });
}

export function deleteFileNavigatorItem(
  managers: Managers, label: string, relPath: string,
): MaybePromise<void> {
  if (!isOpenTab(managers, label)) return;
  return mapMaybe(managers.fileNavigator.delete(label, relPath), (result) => {
    reportOperationFailure(managers, label, 'delete', result);
  });
}

export function moveFileNavigatorItems(
  managers: Managers,
  label: string,
  sourcePaths: string[],
  destinationPath: string,
  policy?: BulkConflictPolicy,
): MaybePromise<BulkMoveResult> {
  if (!isOpenTab(managers, label)) return { total: 0, failedPaths: [] };
  return mapMaybe(managers.fileNavigator.moveMany(label, sourcePaths, destinationPath, policy), (result) => {
    if (!('conflictPaths' in result)) reportOperationFailure(managers, label, 'move', result);
    return result;
  });
}

export function pasteFileNavigatorItems(
  managers: Managers,
  label: string,
  sources: string[],
  destinationPath: string,
  mode: 'copy' | 'cut',
  policy?: BulkConflictPolicy,
  sourceHost?: string,
): MaybePromise<BulkMoveResult> {
  if (!isOpenTab(managers, label)) return { total: 0, failedPaths: [] };
  return mapMaybe(managers.fileNavigator.paste(label, sources, destinationPath, mode, policy, sourceHost), (result) => {
    if (!('conflictPaths' in result)) {
      reportOperationFailure(managers, label, mode === 'copy' ? 'copy' : 'move', result);
    }
    return result;
  });
}

export function deleteFileNavigatorItems(
  managers: Managers, label: string, paths: string[],
): MaybePromise<BatchResult> {
  if (!isOpenTab(managers, label)) return { total: 0, failedPaths: [] };
  return mapMaybe(managers.fileNavigator.deleteMany(label, paths), (result) => {
    reportOperationFailure(managers, label, 'delete', result);
    return result;
  });
}

export function renameFileNavigatorItem(
  managers: Managers, label: string, relPath: string, newName: string,
): MaybePromise<void> {
  if (!isOpenTab(managers, label)) return;
  return mapMaybe(managers.fileNavigator.rename(label, relPath, newName), (result) => {
    reportOperationFailure(managers, label, 'rename', result);
  });
}

export function undoFileNavigatorItem(
  managers: Managers,
  index: number,
  overwrite?: boolean,
  skipConflicts?: boolean,
) {
  return replayFileNavigatorHistory(managers, index, overwrite, skipConflicts, (label, o, s) =>
    managers.fileNavigator.undo(label, o, s),
  );
}

export function redoFileNavigatorItem(
  managers: Managers,
  index: number,
  overwrite?: boolean,
  skipConflicts?: boolean,
) {
  return replayFileNavigatorHistory(managers, index, overwrite, skipConflicts, (label, o, s) =>
    managers.fileNavigator.redo(label, o, s),
  );
}

function replayFileNavigatorHistory(
  managers: Managers,
  index: number,
  overwrite: boolean | undefined,
  skipConflicts: boolean | undefined,
  replay: (
    label: string, overwrite?: boolean, skipConflicts?: boolean,
  ) => MaybePromise<HistoryReplayResult>,
) {
  const label = managers.tab.tabs[index]?.label;
  if (!label) return {};
  return mapMaybe(replay(label, overwrite, skipConflicts), (result) => {
    reportHistoryFailure(managers, label, result);
    return result;
  });
}

// Shared by undo/redo: reports a replay's failures as one `file-operation` notification when the
// result carries `failedPaths` and no conflict — a conflict is a question for the user, not a
// failure, so it is left for the client's own retry flow to resolve.
function reportHistoryFailure(
  managers: Managers,
  label: string,
  result: HistoryReplayResult,
): void {
  if (result.conflict || result.conflicts) return;
  if (result.total === undefined || !result.failedPaths) return;
  reportOperationFailure(managers, label, 'move', {
    total: result.total,
    failedPaths: result.failedPaths,
    ...(result.failureReasons && { failureReasons: result.failureReasons }),
  });
}

export function openFileNavigatorFor(managers: Managers, label: string): void {
  managers.fileNavigator.openOrRetarget(label);
}

export async function fileNavigatorSearch(managers: Managers, index: number): Promise<string[]> {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileNavigator.search(label) : [];
}

export function revealFileNavigatorItem(managers: Managers, index: number, relPath: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.reveal(label, relPath);
}

export function fileNavigatorOpeners(managers: Managers, index: number, relPath: string, edit: boolean, all?: boolean): FileOpenerResolution {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileNavigator.openers(label, relPath, edit, all) : { choices: [] };
}

export function fileNavigatorOpen(
  managers: Managers, index: number, relPath: string, command: FileOpenerChoice['command'],
): MaybePromise<void> {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileNavigator.openFile(label, relPath, command) : undefined;
}

export function fileNavigatorCreateFile(
  managers: Managers, index: number, destination: string,
): MaybePromise<void> {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileNavigator.createFile(label, destination) : undefined;
}

export function fileNavigatorCreateDirectory(
  managers: Managers, index: number, destination: string,
): MaybePromise<string | undefined> {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileNavigator.createDirectory(label, destination) : undefined;
}
