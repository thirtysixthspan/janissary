import * as fileNavigatorRpc from './navigator.js';
import { fileNavigatorSelectionAction, runFileNavigatorSelectionAction } from './navigator-selection.js';
import { fileNavigatorCommit, fileNavigatorNothingToCommit } from './navigator-commit.js';
import { resolveTreeSelections } from '../../file-navigator/selection-request.js';
import type { FileNavigatorDetail } from '../../tab/types.js';
import type { Managers } from '../../managers.js';
import type { BulkConflictPolicy, FileOpenerResolution, FileSelectionAction, FileNavigatorSelectionRecord } from '../../protocol.js';

export type FileNavigatorControllerAdapter = {
  fileNavigatorToggle(index: number, path: string): void;
  fileNavigatorCollapseAll(index: number): void;
  fileNavigatorPull(index: number): void;
  fileNavigatorCommit(index: number, message: string, paths: string[]): void;
  fileNavigatorNothingToCommit(index: number): void;
  fileNavigatorSetDetail(index: number, details: FileNavigatorDetail): void;
  fileNavigatorReroot(index: number, relPath?: string): void;
  moveFileNavigatorItem(label: string, fromRelPath: string, toRelPath: string, overwrite?: boolean): ReturnType<typeof fileNavigatorRpc.moveFileNavigatorItem>;
  moveFileNavigatorItems(label: string, sourcePaths: string[], destinationPath: string, policy?: BulkConflictPolicy): ReturnType<typeof fileNavigatorRpc.moveFileNavigatorItems>;
  pasteFileNavigatorItems(label: string, sources: string[], destinationPath: string, mode: 'copy' | 'cut', policy?: BulkConflictPolicy, sourceHost?: string): ReturnType<typeof fileNavigatorRpc.pasteFileNavigatorItems>;
  deleteFileNavigatorItem(label: string, relPath: string): ReturnType<typeof fileNavigatorRpc.deleteFileNavigatorItem>;
  deleteFileNavigatorItems(label: string, paths: string[]): ReturnType<typeof fileNavigatorRpc.deleteFileNavigatorItems>;
  renameFileNavigatorItem(label: string, relPath: string, newName: string): ReturnType<typeof fileNavigatorRpc.renameFileNavigatorItem>;
  fileNavigatorSearch(index: number): Promise<string[]>;
  revealFileNavigatorItem(index: number, relPath: string): void;
  fileNavigatorOpeners(index: number, relPath: string, edit: boolean, all?: boolean): FileOpenerResolution;
  fileNavigatorOpen(index: number, relPath: string, command: Parameters<typeof fileNavigatorRpc.fileNavigatorOpen>[3]): ReturnType<typeof fileNavigatorRpc.fileNavigatorOpen>;
  fileNavigatorCreateFile(label: string, destination: string): ReturnType<typeof fileNavigatorRpc.fileNavigatorCreateFile>;
  fileNavigatorCreateDirectory(label: string, destination: string): ReturnType<typeof fileNavigatorRpc.fileNavigatorCreateDirectory>;
  fileNavigatorSelectionAction(index: number, paths: string[]): FileSelectionAction | null;
  runFileNavigatorSelectionAction(index: number, paths: string[], action: string): void;
  reportFileNavigatorSelection(id: number, navigators: FileNavigatorSelectionRecord[]): void;
  undoFileNavigatorItem(label: string, overwrite?: boolean, skipConflicts?: boolean): ReturnType<typeof fileNavigatorRpc.undoFileNavigatorItem>;
  redoFileNavigatorItem(label: string, overwrite?: boolean, skipConflicts?: boolean): ReturnType<typeof fileNavigatorRpc.redoFileNavigatorItem>;
  setDock(index: number, dock: 'left' | 'right' | null): void;
  openFileNavigatorFor(label: string): void;
  launchAgentFor(label: string): void;
};

export function createFileNavigatorControllerAdapter(managers: Managers): FileNavigatorControllerAdapter {
  return {
    fileNavigatorToggle: (index, path) => fileNavigatorRpc.fileNavigatorToggle(managers, index, path),
    fileNavigatorCollapseAll: (index) => fileNavigatorRpc.fileNavigatorCollapseAll(managers, index),
    fileNavigatorPull: (index) => fileNavigatorRpc.fileNavigatorPull(managers, index),
    fileNavigatorCommit: (index, message, paths) => fileNavigatorCommit(managers, index, message, paths),
    fileNavigatorNothingToCommit: (index) => fileNavigatorNothingToCommit(managers, index),
    fileNavigatorSetDetail: (index, details) => fileNavigatorRpc.fileNavigatorSetDetail(managers, index, details),
    fileNavigatorReroot: (index, relPath) => fileNavigatorRpc.fileNavigatorReroot(managers, index, relPath),
    moveFileNavigatorItem: (label, from, to, overwrite) => fileNavigatorRpc.moveFileNavigatorItem(managers, label, from, to, overwrite),
    moveFileNavigatorItems: (label, sources, destination, policy) => fileNavigatorRpc.moveFileNavigatorItems(managers, label, sources, destination, policy),
    pasteFileNavigatorItems: (label, sources, destination, mode, policy, sourceHost) => fileNavigatorRpc.pasteFileNavigatorItems(managers, label, sources, destination, mode, policy, sourceHost),
    deleteFileNavigatorItem: (label, relPath) => fileNavigatorRpc.deleteFileNavigatorItem(managers, label, relPath),
    deleteFileNavigatorItems: (label, paths) => fileNavigatorRpc.deleteFileNavigatorItems(managers, label, paths),
    renameFileNavigatorItem: (label, relPath, newName) => fileNavigatorRpc.renameFileNavigatorItem(managers, label, relPath, newName),
    fileNavigatorSearch: (index) => fileNavigatorRpc.fileNavigatorSearch(managers, index),
    revealFileNavigatorItem: (index, relPath) => fileNavigatorRpc.revealFileNavigatorItem(managers, index, relPath),
    fileNavigatorOpeners: (index, relPath, edit, all) => fileNavigatorRpc.fileNavigatorOpeners(managers, index, relPath, edit, all),
    fileNavigatorOpen: (index, relPath, command) => fileNavigatorRpc.fileNavigatorOpen(managers, index, relPath, command),
    fileNavigatorCreateFile: (label, destination) => fileNavigatorRpc.fileNavigatorCreateFile(managers, label, destination),
    fileNavigatorCreateDirectory: (label, destination) => fileNavigatorRpc.fileNavigatorCreateDirectory(managers, label, destination),
    fileNavigatorSelectionAction: (index, paths) => fileNavigatorSelectionAction(managers, index, paths),
    runFileNavigatorSelectionAction: (index, paths, action) => runFileNavigatorSelectionAction(managers, index, paths, action),
    reportFileNavigatorSelection: (id, navigators) => resolveTreeSelections(id, navigators),
    undoFileNavigatorItem: (label, overwrite, skipConflicts) => fileNavigatorRpc.undoFileNavigatorItem(managers, label, overwrite, skipConflicts),
    redoFileNavigatorItem: (label, overwrite, skipConflicts) => fileNavigatorRpc.redoFileNavigatorItem(managers, label, overwrite, skipConflicts),
    setDock: (index, dock) => managers.tab.setDock(index, dock),
    openFileNavigatorFor: (label) => fileNavigatorRpc.openFileNavigatorFor(managers, label),
    launchAgentFor: (label) => managers.profile.newAgentAt(label),
  };
}
