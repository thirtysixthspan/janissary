// Controller-facing wrappers for file tree tab RPCs: resolve the tab index to its label, then
// delegate to `FileTreeManager`. Extracted from `controller.ts` to keep it under the file-size
// limit — see `ai/guidelines/code-guidelines.md`.
import type { Managers } from '../managers.js';
import type { FileOpenerChoice } from '../protocol.js';

export function fileTreeToggle(managers: Managers, index: number, path: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileTree.toggle(label, path);
}

export function fileTreeCollapseAll(managers: Managers, index: number): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileTree.collapseAll(label);
}

export function fileTreeReroot(managers: Managers, index: number, relPath?: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileTree.reroot(label, relPath);
}

export function moveFileTreeItem(managers: Managers, index: number, fromRelPath: string, toRelPath: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileTree.move(label, fromRelPath, toRelPath);
}

export function deleteFileTreeItem(managers: Managers, index: number, relPath: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileTree.delete(label, relPath);
}

export function renameFileTreeItem(managers: Managers, index: number, relPath: string, newName: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileTree.rename(label, relPath, newName);
}

export function undoFileTreeItem(managers: Managers, index: number, overwrite?: boolean): { conflict?: { fromRelPath: string; toRelPath: string } } {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileTree.undo(label, overwrite) : {};
}

export function redoFileTreeItem(managers: Managers, index: number, overwrite?: boolean): { conflict?: { fromRelPath: string; toRelPath: string } } {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileTree.redo(label, overwrite) : {};
}

export function openFileNavigatorFor(managers: Managers, label: string): void {
  managers.fileTree.openOrRetarget(label);
}

export async function fileTreeSearch(managers: Managers, index: number): Promise<string[]> {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileTree.search(label) : [];
}

export function revealFileTreeItem(managers: Managers, index: number, relPath: string): void {
  const label = managers.tab.tabs[index]?.label;
  if (label) managers.fileTree.reveal(label, relPath);
}

export function fileTreeOpeners(managers: Managers, index: number, relPath: string, edit: boolean): { command?: 'open' | 'edit'; choices: FileOpenerChoice[] } {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileTree.openers(label, relPath, edit) : { choices: [] };
}
