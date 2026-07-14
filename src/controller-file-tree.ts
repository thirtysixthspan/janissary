// Controller-facing wrappers for file tree tab RPCs: resolve the tab index to its label, then
// delegate to `FileTreeManager`. Extracted from `controller.ts` to keep it under the file-size
// limit — see `ai/guidelines/code-guidelines.md`.
import type { Managers } from './managers.js';

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

export function undoFileTreeItem(managers: Managers, index: number, overwrite?: boolean): { conflict?: { fromRelPath: string; toRelPath: string } } {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileTree.undo(label, overwrite) : {};
}

export function redoFileTreeItem(managers: Managers, index: number, overwrite?: boolean): { conflict?: { fromRelPath: string; toRelPath: string } } {
  const label = managers.tab.tabs[index]?.label;
  return label ? managers.fileTree.redo(label, overwrite) : {};
}
