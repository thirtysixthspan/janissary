// Controller-facing wrappers for file navigator tab RPCs: resolve the tab index to its label, then
// delegate to `FileNavigatorManager`. Extracted from `controller.ts` to keep it under the file-size
// limit — see `ai/guidelines/code-guidelines.md`.
import { reportOperationFailure } from '../file-navigator/operation-report.js';
import type { Managers } from '../managers.js';
import type { BatchResult, BulkConflictPolicy, BulkMoveResult, FileNavigatorDetail, FileOpenerResolution } from '../protocol.js';

export function fileNavigatorToggle(managers: Managers, index: number, path: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.toggle(label, path);
}

export function fileNavigatorCollapseAll(managers: Managers, index: number): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.collapseAll(label);
}

export function fileNavigatorSetDetail(managers: Managers, index: number, details: FileNavigatorDetail): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.setDetail(label, details);
}

export function fileNavigatorReroot(managers: Managers, index: number, relPath?: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.reroot(label, relPath);
}

export function moveFileNavigatorItem(managers: Managers, index: number, fromRelPath: string, toRelPath: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (!label) return;
  const result = managers.fileNavigator.move(label, fromRelPath, toRelPath);
  reportOperationFailure(managers, label, 'move', result);
}

export function deleteFileNavigatorItem(managers: Managers, index: number, relPath: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (!label) return;
  const result = managers.fileNavigator.delete(label, relPath);
  reportOperationFailure(managers, label, 'delete', result);
}

export function moveFileNavigatorItems(
  managers: Managers,
  index: number,
  sourcePaths: string[],
  destinationPath: string,
  policy?: BulkConflictPolicy,
): BulkMoveResult {
  const label = managers.tab.tabs[index]?.label;
  if (!label) return { total: 0, failedPaths: [] };
  const result = managers.fileNavigator.moveMany(label, sourcePaths, destinationPath, policy);
  if (!('conflictPaths' in result)) reportOperationFailure(managers, label, 'move', result);
  return result;
}

export function pasteFileNavigatorItems(
  managers: Managers,
  index: number,
  sources: string[],
  destinationPath: string,
  mode: 'copy' | 'cut',
  policy?: BulkConflictPolicy,
): BulkMoveResult {
  const label = managers.tab.tabs[index]?.label;
  if (!label) return { total: 0, failedPaths: [] };
  const result = managers.fileNavigator.paste(label, sources, destinationPath, mode, policy);
  if (!('conflictPaths' in result)) reportOperationFailure(managers, label, mode === 'copy' ? 'copy' : 'move', result);
  return result;
}

export function deleteFileNavigatorItems(managers: Managers, index: number, paths: string[]): BatchResult {
  const label = managers.tab.tabs[index]?.label;
  if (!label) return { total: 0, failedPaths: [] };
  const result = managers.fileNavigator.deleteMany(label, paths);
  reportOperationFailure(managers, label, 'delete', result);
  return result;
}

export function renameFileNavigatorItem(managers: Managers, index: number, relPath: string, newName: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.rename(label, relPath, newName);
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
  replay: (label: string, overwrite?: boolean, skipConflicts?: boolean) => { total?: number; failedPaths?: string[]; conflict?: unknown; conflicts?: unknown },
) {
  const label = managers.tab.tabs[index]?.label;
  if (!label) return {};
  const result = replay(label, overwrite, skipConflicts);
  reportHistoryFailure(managers, label, result);
  return result;
}

// Shared by undo/redo: reports a replay's failures as one `file-operation` notification when the
// result carries `failedPaths` and no conflict — a conflict is a question for the user, not a
// failure, so it is left for the client's own retry flow to resolve.
function reportHistoryFailure(
  managers: Managers,
  label: string,
  result: { total?: number; failedPaths?: string[]; conflict?: unknown; conflicts?: unknown },
): void {
  if (result.conflict || result.conflicts) return;
  if (result.total === undefined || !result.failedPaths) return;
  reportOperationFailure(managers, label, 'move', { total: result.total, failedPaths: result.failedPaths });
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

export function fileNavigatorOpeners(managers: Managers, index: number, relPath: string, edit: boolean): FileOpenerResolution {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileNavigator.openers(label, relPath, edit) : { choices: [] };
}
