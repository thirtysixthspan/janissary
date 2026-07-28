// Controller-facing wrappers for file navigator tab RPCs: resolve the tab index to its label, then
// delegate to `FileNavigatorManager`. Extracted from `controller.ts` to keep it under the file-size
// limit — see `ai/guidelines/code-guidelines.md`.
import type { Managers } from '../managers.js';
import type { BatchResult, BulkConflictPolicy, BulkMoveResult, FileOpenerChoice } from '../protocol.js';

export function fileNavigatorToggle(managers: Managers, index: number, path: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.toggle(label, path);
}

export function fileNavigatorCollapseAll(managers: Managers, index: number): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.collapseAll(label);
}

export function fileNavigatorReroot(managers: Managers, index: number, relPath?: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.reroot(label, relPath);
}

export function moveFileNavigatorItem(managers: Managers, index: number, fromRelPath: string, toRelPath: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.move(label, fromRelPath, toRelPath);
}

export function deleteFileNavigatorItem(managers: Managers, index: number, relPath: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileNavigator.delete(label, relPath);
}

export function moveFileNavigatorItems(
  managers: Managers,
  index: number,
  sourcePaths: string[],
  destinationPath: string,
  policy?: BulkConflictPolicy,
): BulkMoveResult {
  const label = managers.tab.tabs[index]?.label;
  return label
    ? managers.fileNavigator.moveMany(label, sourcePaths, destinationPath, policy)
    : { total: 0, failedPaths: [] };
}

export function deleteFileNavigatorItems(managers: Managers, index: number, paths: string[]): BatchResult {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileNavigator.deleteMany(label, paths) : { total: 0, failedPaths: [] };
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
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileNavigator.undo(label, overwrite, skipConflicts) : {};
}

export function redoFileNavigatorItem(
  managers: Managers,
  index: number,
  overwrite?: boolean,
  skipConflicts?: boolean,
) {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileNavigator.redo(label, overwrite, skipConflicts) : {};
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

export function fileNavigatorOpeners(managers: Managers, index: number, relPath: string, edit: boolean): { command?: 'open' | 'edit'; choices: FileOpenerChoice[] } {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileNavigator.openers(label, relPath, edit) : { choices: [] };
}
