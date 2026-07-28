import { lstatSync, renameSync } from 'node:fs';
import path from 'node:path';
import { moveReplacingDestination } from './filesystem.js';
import { parentPath } from './index.js';
import type { BatchResult, BulkConflictPolicy } from '../protocol.js';

export type MoveEntry = { from: string; to: string };
export type MoveGroup = { entries: MoveEntry[] };
export type MoveConflict = { fromRelPath: string; toRelPath: string };
export type UndoRedoResult = Partial<BatchResult> & {
  conflict?: MoveConflict;
  conflicts?: MoveConflict[];
};

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
  fromStack: MoveGroup[],
  toStack: MoveGroup[],
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
