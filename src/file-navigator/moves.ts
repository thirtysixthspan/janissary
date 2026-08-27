import { lstatSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { copyItem, moveReplacingDestination } from './filesystem.js';
import { parentPath } from './index.js';
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

function performMoveReplay(
  root: string, ordered: MoveEntry[], direction: 'undo' | 'redo', policy: BulkConflictPolicy | undefined,
  conflictSources: Set<string>,
): { successful: Set<MoveEntry>; failed: Set<MoveEntry> } {
  const attempted = ordered.filter((entry) =>
    policy !== 'skip-conflicts' || !conflictSources.has(replayPaths(root, entry, direction).sourceRel));
  const successful = new Set(attempted.filter((entry) => {
    const replay = replayPaths(root, entry, direction);
    return tryMove(replay.source, replay.destination, policy === 'overwrite-all');
  }));
  return { successful, failed: new Set(attempted.filter((entry) => !successful.has(entry))) };
}

export function applyStackMove(
  root: string, group: MoveGroup, direction: 'undo' | 'redo',
  fromStack: HistoryStep[], toStack: HistoryStep[], policy: BulkConflictPolicy | undefined,
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
  const { successful, failed } = performMoveReplay(root, ordered, direction, policy, conflictSources);
  if (successful.size > 0) {
    fromStack.pop();
    const remaining = group.entries.filter((entry) => !successful.has(entry));
    if (remaining.length > 0) fromStack.push({ entries: remaining });
    toStack.push({ entries: group.entries.filter((entry) => successful.has(entry)) });
    rebuild();
  }
  return {
    total: group.entries.length,
    failedPaths: group.entries.filter((entry) => failed.has(entry)).map((entry) => replayPaths(root, entry, direction).sourceRel),
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

// Undoing a copy deletes what it created, so it needs no move-style conflict preflight.
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
  return pasteReplayResult(group.pairs, failed);
}

// Shared tail of an undo/redo replay: reports how many pairs were replayed and which failed.
function pasteReplayResult(pairs: PastePair[], failed: Set<PastePair>): UndoRedoResult {
  return {
    total: pairs.length,
    failedPaths: pairs.filter((pair) => failed.has(pair)).map((pair) => pair.to),
  };
}

type PasteReplayLeg = { source: string; destination: string; pair: PastePair };

function pasteReplayLegs(group: PasteGroup, isUndo: boolean): PasteReplayLeg[] {
  return group.pairs.map((pair) => (isUndo
    ? { source: pair.to, destination: pair.from, pair }
    : { source: pair.from, destination: pair.to, pair }));
}

// Perform each replay leg, skipping conflicts when requested, and classify the results.
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
  return pasteReplayResult(group.pairs, failed);
}
