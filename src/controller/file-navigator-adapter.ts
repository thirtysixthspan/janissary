import * as fileNavigatorRpc from './file-navigator.js';
import { resolveTreeSelections } from '../file-navigator/selection-request.js';
import type { FileNavigatorDetail } from '../tab/types.js';
import type { Managers } from '../managers.js';
import type { BatchResult, BulkConflictPolicy, BulkMoveResult, FileOpenerResolution, FileNavigatorSelectionRecord } from '../protocol.js';

export type FileNavigatorControllerAdapter = {
  fileNavigatorToggle(index: number, path: string): void;
  fileNavigatorCollapseAll(index: number): void;
  fileNavigatorSetDetail(index: number, details: FileNavigatorDetail): void;
  fileNavigatorReroot(index: number, relPath?: string): void;
  moveFileNavigatorItem(index: number, fromRelPath: string, toRelPath: string): void;
  moveFileNavigatorItems(index: number, sourcePaths: string[], destinationPath: string, policy?: BulkConflictPolicy): BulkMoveResult;
  pasteFileNavigatorItems(index: number, sources: string[], destinationPath: string, mode: 'copy' | 'cut', policy?: BulkConflictPolicy): BulkMoveResult;
  deleteFileNavigatorItem(index: number, relPath: string): void;
  deleteFileNavigatorItems(index: number, paths: string[]): BatchResult;
  renameFileNavigatorItem(index: number, relPath: string, newName: string): void;
  fileNavigatorSearch(index: number): Promise<string[]>;
  revealFileNavigatorItem(index: number, relPath: string): void;
  fileNavigatorOpeners(index: number, relPath: string, edit: boolean): FileOpenerResolution;
  reportFileNavigatorSelection(id: number, navigators: FileNavigatorSelectionRecord[]): void;
  undoFileNavigatorItem(index: number, overwrite?: boolean, skipConflicts?: boolean): ReturnType<typeof fileNavigatorRpc.undoFileNavigatorItem>;
  redoFileNavigatorItem(index: number, overwrite?: boolean, skipConflicts?: boolean): ReturnType<typeof fileNavigatorRpc.redoFileNavigatorItem>;
  setDock(index: number, dock: 'left' | 'right' | null): void;
  openFileNavigatorFor(label: string): void;
  launchAgentFor(label: string): void;
};

export function createFileNavigatorControllerAdapter(managers: Managers): FileNavigatorControllerAdapter {
  return {
    fileNavigatorToggle: (index, path) => fileNavigatorRpc.fileNavigatorToggle(managers, index, path),
    fileNavigatorCollapseAll: (index) => fileNavigatorRpc.fileNavigatorCollapseAll(managers, index),
    fileNavigatorSetDetail: (index, details) => fileNavigatorRpc.fileNavigatorSetDetail(managers, index, details),
    fileNavigatorReroot: (index, relPath) => fileNavigatorRpc.fileNavigatorReroot(managers, index, relPath),
    moveFileNavigatorItem: (index, from, to) => fileNavigatorRpc.moveFileNavigatorItem(managers, index, from, to),
    moveFileNavigatorItems: (index, sources, destination, policy) => fileNavigatorRpc.moveFileNavigatorItems(managers, index, sources, destination, policy),
    pasteFileNavigatorItems: (index, sources, destination, mode, policy) => fileNavigatorRpc.pasteFileNavigatorItems(managers, index, sources, destination, mode, policy),
    deleteFileNavigatorItem: (index, relPath) => fileNavigatorRpc.deleteFileNavigatorItem(managers, index, relPath),
    deleteFileNavigatorItems: (index, paths) => fileNavigatorRpc.deleteFileNavigatorItems(managers, index, paths),
    renameFileNavigatorItem: (index, relPath, newName) => fileNavigatorRpc.renameFileNavigatorItem(managers, index, relPath, newName),
    fileNavigatorSearch: (index) => fileNavigatorRpc.fileNavigatorSearch(managers, index),
    revealFileNavigatorItem: (index, relPath) => fileNavigatorRpc.revealFileNavigatorItem(managers, index, relPath),
    fileNavigatorOpeners: (index, relPath, edit) => fileNavigatorRpc.fileNavigatorOpeners(managers, index, relPath, edit),
    reportFileNavigatorSelection: (id, navigators) => resolveTreeSelections(id, navigators),
    undoFileNavigatorItem: (index, overwrite, skipConflicts) => fileNavigatorRpc.undoFileNavigatorItem(managers, index, overwrite, skipConflicts),
    redoFileNavigatorItem: (index, overwrite, skipConflicts) => fileNavigatorRpc.redoFileNavigatorItem(managers, index, overwrite, skipConflicts),
    setDock: (index, dock) => managers.tab.setDock(index, dock),
    openFileNavigatorFor: (label) => fileNavigatorRpc.openFileNavigatorFor(managers, label),
    launchAgentFor: (label) => managers.profile.newAgentAt(label),
  };
}
