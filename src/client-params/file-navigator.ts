import type { FileNavigatorRpcCall } from '../protocol/file-navigator.js';
import {
  isInteger, isOneOf, isRecord, isString, isStringArray, optionalBoolean, optionalOneOf,
  optionalString, type ParamsDecoder,
} from './guards.js';

const POLICIES = ['overwrite-all', 'skip-conflicts'];
const DETAILS = ['name', 'size', 'modified', 'permissions'];
const OPENER_COMMANDS = ['open', 'edit', 'open external'];
const PASTE_MODES = ['copy', 'cut'];

// One navigator's reported selection: the tab index it belongs to, its selected tree-relative
// paths, and the optional cursor/anchor rows.
function isSelectionRecord(value: unknown): boolean {
  return isRecord(value)
    && isInteger(value.index)
    && isStringArray(value.selected)
    && optionalString(value.cursor)
    && optionalString(value.anchor);
}

// Keyed by the union so a method added to `FileNavigatorRpcCall` without a decoder fails the build.
export const FILE_NAVIGATOR_PARAMS: Record<FileNavigatorRpcCall['method'], ParamsDecoder> = {
  fileNavigatorToggle: (p) => isInteger(p.index) && isString(p.path),
  fileNavigatorCollapseAll: (p) => isInteger(p.index),
  fileNavigatorPull: (p) => isInteger(p.index),
  fileNavigatorSetDetail: (p) => isInteger(p.index) && isOneOf(p.details, DETAILS),
  fileNavigatorReroot: (p) => isInteger(p.index) && optionalString(p.path),
  moveFileNavigatorItem: (p) => isInteger(p.index) && isString(p.fromRelPath) && isString(p.toRelPath),
  moveFileNavigatorItems: (p) => isInteger(p.index) && isStringArray(p.sourcePaths)
    && isString(p.destinationPath) && optionalOneOf(p.policy, POLICIES),
  pasteFileNavigatorItems: (p) => isInteger(p.index) && isStringArray(p.sources)
    && isString(p.destinationPath) && isOneOf(p.mode, PASTE_MODES)
    && optionalOneOf(p.policy, POLICIES) && optionalString(p.sourceHost),
  deleteFileNavigatorItem: (p) => isInteger(p.index) && isString(p.relPath),
  deleteFileNavigatorItems: (p) => isInteger(p.index) && isStringArray(p.paths),
  renameFileNavigatorItem: (p) => isInteger(p.index) && isString(p.relPath) && isString(p.newName),
  fileNavigatorSearch: (p) => isInteger(p.index),
  revealFileNavigatorItem: (p) => isInteger(p.index) && isString(p.relPath),
  fileNavigatorOpeners: (p) => isInteger(p.index) && isString(p.relPath)
    && typeof p.edit === 'boolean' && optionalBoolean(p.all),
  fileNavigatorOpen: (p) => isInteger(p.index) && isString(p.relPath) && isOneOf(p.command, OPENER_COMMANDS),
  fileNavigatorCreateFile: (p) => isInteger(p.index) && isString(p.destination),
  fileNavigatorCreateDirectory: (p) => isInteger(p.index) && isString(p.destination),
  fileNavigatorSelectionAction: (p) => isInteger(p.index) && isStringArray(p.paths),
  runFileNavigatorSelectionAction: (p) => isInteger(p.index) && isStringArray(p.paths) && isString(p.action),
  reportFileNavigatorSelection: (p) => isInteger(p.id)
    && Array.isArray(p.navigators) && p.navigators.every((record) => isSelectionRecord(record)),
  undoFileNavigatorItem: (p) => isInteger(p.index) && optionalBoolean(p.overwrite) && optionalBoolean(p.skipConflicts),
  redoFileNavigatorItem: (p) => isInteger(p.index) && optionalBoolean(p.overwrite) && optionalBoolean(p.skipConflicts),
  openFileNavigatorFor: (p) => isString(p.label),
};
