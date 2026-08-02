import { lstatSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { copyItem, moveReplacingDestination } from './filesystem.js';
import { parentPath } from './index.js';
import type { PastePair } from './paste.js';
import type { BulkConflictPolicy, UndoRedoResult } from '../protocol.js';

export type MoveEntry = { from: string; to: string };
export type MoveGroup = { entries: MoveEntry[] };

// A paste (copy or cut) as one undo/redo history step, alongside `MoveGroup`. Its pairs are
// absolute paths, since the clipboard's sources may lie outside the pasting tab's root — a
// cross-root cut-paste undoes exactly like a same-root one, with no special case. Distinguished
// from `MoveGroup` structurally (by the `mode` field) rather than a tag, so `MoveGroup` itself
// stays untouched.
export type PasteGroup = { mode: 'copy' | 'cut'; pairs: PastePair[] };
export type HistoryStep = MoveGroup | PasteGroup;

export function isPasteGroup(step: HistoryStep): step is PasteGroup {
  return 'mode' in step;
}

function exists(absolute: string): boolean {
  try {
    lstatSync(absolute);
    return true;
  } catch {
    return false;
  }
}

function replayPaths(root: string, entry: MoveEntry, direction: 'undo' | 'redo') {
  const sourceRel = entry[direction === 'undo' ? 'to' : 'from'];
  const destinationPath = parentPath(entry[direction === 'undo' ? 'from' : 'to']);
  const source = path.join(root, sourceRel);
  const destination = path.join(root, destinationPath, path.basename(source));
  return { sourceRel, destinationPath, source, destination };
}

function tryMove(source: string, destination: string, overwrite: boolean): boolean {
  if (overwrite) return moveReplacingDestination(source, destination);
  try {
    renameSync(source, destination);
    return true;
  } catch {
    return false;
  }
}

export function applyStackMove(
  root: string,
  group: MoveGroup,
  direction: 'undo' | 'redo',
  fromStack: HistoryStep[],
  toStack: HistoryStep[],
  policy: BulkConflictPolicy | undefined,
  rebuild: () => void,
): UndoRedoResult {
  const ordered = direction === 'undo' ? group.entries.toReversed() : group.entries;
  const conflicts = ordered
    .map((entry) => replayPaths(root, entry, direction))
    .filter(({ source, destination }) => source !== destination && exists(destination))
    .map(({ sourceRel, destinationPath }) => ({ fromRelPath: sourceRel, toRelPath: destinationPath }));
  if (conflicts.length > 0 && policy === undefined) {
    return group.entries.length === 1
      ? { total: group.entries.length, failedPaths: [], conflict: conflicts[0] }
      : { total: group.entries.length, failedPaths: [], conflicts };
  }

  const conflictSources = new Set(conflicts.map((conflict) => conflict.fromRelPath));
  const successful = new Set<MoveEntry>();
  const failed = new Set<MoveEntry>();
  for (const entry of ordered) {
    const replay = replayPaths(root, entry, direction);
    if (policy === 'skip-conflicts' && conflictSources.has(replay.sourceRel)) continue;
    if (tryMove(replay.source, replay.destination, policy === 'overwrite-all')) successful.add(entry);
    else failed.add(entry);
  }

  if (successful.size > 0) {
    fromStack.pop();
    const remaining = group.entries.filter((entry) => !successful.has(entry));
    if (remaining.length > 0) fromStack.push({ entries: remaining });
    toStack.push({ entries: group.entries.filter((entry) => successful.has(entry)) });
    rebuild();
  }
  return {
    total: group.entries.length,
    failedPaths: group.entries
      .filter((entry) => failed.has(entry))
      .map((entry) => replayPaths(root, entry, direction).sourceRel),
  };
}

function removeAbsolute(absolute: string): boolean {
  try {
    rmSync(absolute, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

// Undo of a copy-paste: delete what it created. A delete never collides with an occupied
// destination the way a move does, so this needs no conflict preflight.
function undoCopyPaste(
  group: PasteGroup,
  fromStack: HistoryStep[],
  toStack: HistoryStep[],
  rebuild: () => void,
): UndoRedoResult {
  const failed = new Set<PastePair>();
  for (const pair of group.pairs) {
    if (!removeAbsolute(pair.to)) failed.add(pair);
  }
  const successful = group.pairs.filter((pair) => !failed.has(pair));
  if (successful.length > 0) {
    fromStack.pop();
    const remaining = group.pairs.filter((pair) => failed.has(pair));
    if (remaining.length > 0) fromStack.push({ mode: group.mode, pairs: remaining });
    toStack.push({ mode: group.mode, pairs: successful });
    rebuild();
  }
  return {
    total: group.pairs.length,
    failedPaths: group.pairs.filter((pair) => failed.has(pair)).map((pair) => pair.to),
  };
}

type PasteReplayLeg = { source: string; destination: string; pair: PastePair };

function pasteReplayLegs(group: PasteGroup, isUndo: boolean): PasteReplayLeg[] {
  return group.pairs.map((pair) => (isUndo
    ? { source: pair.to, destination: pair.from, pair }
    : { source: pair.from, destination: pair.to, pair }));
}

// Performs each replay leg (skipping a conflict under `skip-conflicts`), returning the pairs that
// succeeded and failed.
function performPasteReplay(
  replay: PasteReplayLeg[],
  isCopy: boolean,
  isUndo: boolean,
  policy: BulkConflictPolicy | undefined,
  conflictSources: Set<string>,
): { successful: Set<PastePair>; failed: Set<PastePair> } {
  const successful = new Set<PastePair>();
  const failed = new Set<PastePair>();
  for (const { source, destination, pair } of replay) {
    if (policy === 'skip-conflicts' && conflictSources.has(pair.from)) continue;
    const overwrite = policy === 'overwrite-all';
    const didApply = isCopy && !isUndo
      ? copyItem(source, destination, overwrite)
      : tryMove(source, destination, overwrite);
    if (didApply) successful.add(pair);
    else failed.add(pair);
  }
  return { successful, failed };
}

// Undo/redo replay for a paste step. Undoing a copy just deletes what the paste created (see
// `undoCopyPaste`); every other case (redo of either mode, or undo of a cut) is a move or copy
// back over the same pair, replaying through the same conflict-preflight shape `applyStackMove`
// uses.
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

  if (isUndo && isCopy) return undoCopyPaste(group, fromStack, toStack, rebuild);

  const replay = pasteReplayLegs(group, isUndo);
  const conflicts = replay
    .filter(({ source, destination }) => source !== destination && exists(destination))
    .map(({ pair }) => ({ fromRelPath: pair.from, toRelPath: pair.to }));
  if (conflicts.length > 0 && policy === undefined) {
    return group.pairs.length === 1
      ? { total: group.pairs.length, failedPaths: [], conflict: conflicts[0] }
      : { total: group.pairs.length, failedPaths: [], conflicts };
  }

  const conflictSources = new Set(conflicts.map((conflict) => conflict.fromRelPath));
  const { successful, failed } = performPasteReplay(replay, isCopy, isUndo, policy, conflictSources);

  if (successful.size > 0) {
    fromStack.pop();
    const remaining = group.pairs.filter((pair) => !successful.has(pair));
    if (remaining.length > 0) fromStack.push({ mode: group.mode, pairs: remaining });
    toStack.push({ mode: group.mode, pairs: group.pairs.filter((pair) => successful.has(pair)) });
    rebuild();
  }
  return {
    total: group.pairs.length,
    failedPaths: group.pairs.filter((pair) => failed.has(pair)).map((pair) => pair.to),
  };
}
