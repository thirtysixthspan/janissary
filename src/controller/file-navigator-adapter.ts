import * as fileNavigatorRpc from './file-navigator.js';
import { resolveTreeSelections } from '../file-navigator/selection-request.js';
import type { FileNavigatorDetail } from '../tab/types.js';
import type { Managers } from '../managers.js';
import type { BulkConflictPolicy, FileOpenerResolution, FileSelectionAction, FileNavigatorSelectionRecord } from '../protocol.js';

export type FileNavigatorControllerAdapter = {
  fileNavigatorToggle(index: number, path: string): void;
  fileNavigatorCollapseAll(index: number): void;
  fileNavigatorPull(index: number): void;
  fileNavigatorSetDetail(index: number, details: FileNavigatorDetail): void;
  fileNavigatorReroot(index: number, relPath?: string): void;
  moveFileNavigatorItem(index: number, fromRelPath: string, toRelPath: string): ReturnType<typeof fileNavigatorRpc.moveFileNavigatorItem>;
  moveFileNavigatorItems(index: number, sourcePaths: string[], destinationPath: string, policy?: BulkConflictPolicy): ReturnType<typeof fileNavigatorRpc.moveFileNavigatorItems>;
  pasteFileNavigatorItems(index: number, sources: string[], destinationPath: string, mode: 'copy' | 'cut', policy?: BulkConflictPolicy, sourceHost?: string): ReturnType<typeof fileNavigatorRpc.pasteFileNavigatorItems>;
  deleteFileNavigatorItem(index: number, relPath: string): ReturnType<typeof fileNavigatorRpc.deleteFileNavigatorItem>;
  deleteFileNavigatorItems(index: number, paths: string[]): ReturnType<typeof fileNavigatorRpc.deleteFileNavigatorItems>;
  renameFileNavigatorItem(index: number, relPath: string, newName: string): ReturnType<typeof fileNavigatorRpc.renameFileNavigatorItem>;
  fileNavigatorSearch(index: number): Promise<string[]>;
  revealFileNavigatorItem(index: number, relPath: string): void;
  fileNavigatorOpeners(index: number, relPath: string, edit: boolean, all?: boolean): FileOpenerResolution;
  fileNavigatorOpen(index: number, relPath: string, command: Parameters<typeof fileNavigatorRpc.fileNavigatorOpen>[3]): ReturnType<typeof fileNavigatorRpc.fileNavigatorOpen>;
  fileNavigatorCreateFile(index: number, destination: string): ReturnType<typeof fileNavigatorRpc.fileNavigatorCreateFile>;
  fileNavigatorCreateDirectory(index: number, destination: string): ReturnType<typeof fileNavigatorRpc.fileNavigatorCreateDirectory>;
  fileNavigatorSelectionAction(index: number, paths: string[]): FileSelectionAction | null;
  runFileNavigatorSelectionAction(index: number, paths: string[], action: string): void;
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
    fileNavigatorPull: (index) => fileNavigatorRpc.fileNavigatorPull(managers, index),
    fileNavigatorSetDetail: (index, details) => fileNavigatorRpc.fileNavigatorSetDetail(managers, index, details),
    fileNavigatorReroot: (index, relPath) => fileNavigatorRpc.fileNavigatorReroot(managers, index, relPath),
    moveFileNavigatorItem: (index, from, to) => fileNavigatorRpc.moveFileNavigatorItem(managers, index, from, to),
    moveFileNavigatorItems: (index, sources, destination, policy) => fileNavigatorRpc.moveFileNavigatorItems(managers, index, sources, destination, policy),
    pasteFileNavigatorItems: (index, sources, destination, mode, policy, sourceHost) => fileNavigatorRpc.pasteFileNavigatorItems(managers, index, sources, destination, mode, policy, sourceHost),
    deleteFileNavigatorItem: (index, relPath) => fileNavigatorRpc.deleteFileNavigatorItem(managers, index, relPath),
    deleteFileNavigatorItems: (index, paths) => fileNavigatorRpc.deleteFileNavigatorItems(managers, index, paths),
    renameFileNavigatorItem: (index, relPath, newName) => fileNavigatorRpc.renameFileNavigatorItem(managers, index, relPath, newName),
    fileNavigatorSearch: (index) => fileNavigatorRpc.fileNavigatorSearch(managers, index),
    revealFileNavigatorItem: (index, relPath) => fileNavigatorRpc.revealFileNavigatorItem(managers, index, relPath),
    fileNavigatorOpeners: (index, relPath, edit, all) => fileNavigatorRpc.fileNavigatorOpeners(managers, index, relPath, edit, all),
    fileNavigatorOpen: (index, relPath, command) => fileNavigatorRpc.fileNavigatorOpen(managers, index, relPath, command),
    fileNavigatorCreateFile: (index, destination) => fileNavigatorRpc.fileNavigatorCreateFile(managers, index, destination),
    fileNavigatorCreateDirectory: (index, destination) => fileNavigatorRpc.fileNavigatorCreateDirectory(managers, index, destination),
    fileNavigatorSelectionAction: (index, paths) => fileNavigatorRpc.fileNavigatorSelectionAction(managers, index, paths),
    runFileNavigatorSelectionAction: (index, paths, action) => fileNavigatorRpc.runFileNavigatorSelectionAction(managers, index, paths, action),
    reportFileNavigatorSelection: (id, navigators) => resolveTreeSelections(id, navigators),
    undoFileNavigatorItem: (index, overwrite, skipConflicts) => fileNavigatorRpc.undoFileNavigatorItem(managers, index, overwrite, skipConflicts),
    redoFileNavigatorItem: (index, overwrite, skipConflicts) => fileNavigatorRpc.redoFileNavigatorItem(managers, index, overwrite, skipConflicts),
    setDock: (index, dock) => managers.tab.setDock(index, dock),
    openFileNavigatorFor: (label) => fileNavigatorRpc.openFileNavigatorFor(managers, label),
    launchAgentFor: (label) => managers.profile.newAgentAt(label),
  };
}
