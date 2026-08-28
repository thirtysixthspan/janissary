import path from 'node:path';
import { copyItem, moveReplacingDestination, removePath, renamePath } from './filesystem.js';
import { type FileOperationResult } from './file-operation-result.js';
import { parentPath } from './index.js';
import { applyReplayProtocol, type ReplayLeg } from './replay-protocol.js';
import type { PastePair } from './paste.js';
import type { BulkConflictPolicy, UndoRedoResult } from '../protocol.js';

export type MoveEntry = { from: string; to: string };
export type MoveGroup = { entries: MoveEntry[] };

// Paste history uses absolute paths because clipboard sources may cross roots. The structural
// `mode` field distinguishes it from `MoveGroup` without changing `MoveGroup`.
export type PasteGroup = { mode: 'copy' | 'cut'; pairs: PastePair[] };
export type HistoryStep = MoveGroup | PasteGroup;

export function isPasteGroup(step: HistoryStep): step is PasteGroup {
  return 'mode' in step;
}

function moveReplayLeg(root: string, entry: MoveEntry, direction: 'undo' | 'redo'): ReplayLeg<MoveEntry> {
  const sourceRel = entry[direction === 'undo' ? 'to' : 'from'];
  const destinationPath = parentPath(entry[direction === 'undo' ? 'from' : 'to']);
  const source = path.join(root, sourceRel);
  const destination = path.join(root, destinationPath, path.basename(source));
  return {
    item: entry,
    source,
    destination,
    conflict: { fromRelPath: sourceRel, toRelPath: destinationPath },
    failurePath: sourceRel,
  };
}

function tryMove(source: string, destination: string, overwrite: boolean): FileOperationResult {
  if (overwrite) return moveReplacingDestination(source, destination);
  return renamePath(source, destination);
}

export function applyStackMove(
  root: string, group: MoveGroup, direction: 'undo' | 'redo',
  fromStack: HistoryStep[], toStack: HistoryStep[], policy: BulkConflictPolicy | undefined,
  rebuild: () => void,
): UndoRedoResult {
  const ordered = direction === 'undo' ? group.entries.toReversed() : group.entries;
  return applyReplayProtocol<MoveEntry, HistoryStep>({
    groupItems: group.entries,
    replayItems: ordered,
    fromStack,
    toStack,
    policy,
    rebuild,
    makeStep: (entries) => ({ entries }),
    leg: (entry) => moveReplayLeg(root, entry, direction),
    apply: ({ source, destination }, overwrite) => tryMove(source, destination, overwrite),
  });
}

function pasteReplayLeg(pair: PastePair, isUndo: boolean): ReplayLeg<PastePair> {
  return {
    item: pair,
    source: isUndo ? pair.to : pair.from,
    destination: isUndo ? pair.from : pair.to,
    conflict: { fromRelPath: pair.from, toRelPath: pair.to },
    failurePath: pair.to,
  };
}

function applyPasteLeg(
  current: ReplayLeg<PastePair>,
  isCopy: boolean,
  isUndo: boolean,
  overwrite: boolean,
): FileOperationResult {
  if (isCopy && isUndo) return removePath(current.source);
  return isCopy
    ? copyItem(current.source, current.destination, overwrite)
    : tryMove(current.source, current.destination, overwrite);
}

// Copy undo deletes its output; every other replay uses the same conflict preflight as a stack move.
export function applyStackPaste(
  group: PasteGroup,
  direction: 'undo' | 'redo',
  fromStack: HistoryStep[],
  toStack: HistoryStep[],
  policy: BulkConflictPolicy | undefined,
  rebuild: () => void,
): UndoRedoResult {
  const isUndo = direction === 'undo';
  const isCopy = group.mode === 'copy';
  return applyReplayProtocol<PastePair, HistoryStep>({
    groupItems: group.pairs,
    replayItems: group.pairs,
    fromStack,
    toStack,
    policy,
    rebuild,
    makeStep: (pairs) => ({ mode: group.mode, pairs }),
    leg: (pair) => pasteReplayLeg(pair, isUndo),
    apply: (current, overwrite) => applyPasteLeg(current, isCopy, isUndo, overwrite),
    preflight: !(isUndo && isCopy),
  });
}
