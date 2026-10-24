import * as fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { containedPath } from '../path-containment.js';
import {
  failureResult,
  INVALID_NAME_REASON,
  OUTSIDE_ROOT_REASON,
  runFileOperation,
  type FileOperationResult,
} from './file-operation-result.js';

function exists(absolute: string): boolean {
  try {
    fs.lstatSync(absolute);
    return true;
  } catch {
    return false;
  }
}

export function renamePath(source: string, destination: string): FileOperationResult {
  return runFileOperation(() => fs.renameSync(source, destination));
}

export function removePath(absolute: string): FileOperationResult {
  return runFileOperation(() => fs.rmSync(absolute, { recursive: true }));
}

export function moveReplacingDestination(source: string, destination: string): FileOperationResult {
  if (!exists(destination)) {
    return renamePath(source, destination);
  }
  const backup = `${destination}.janissary-${randomUUID()}`;
  const backupMove = renamePath(destination, backup);
  if (!backupMove.ok) return backupMove;
  const sourceMove = renamePath(source, destination);
  if (!sourceMove.ok) {
    renamePath(backup, destination);
    return sourceMove;
  }
  removePath(backup);
  return sourceMove;
}

function removeStagingPath(staging: string): void {
  try {
    fs.rmSync(staging, { recursive: true, force: true });
  } catch { /* preserve the original copy or install failure */ }
}

function copyWithOverwrite(source: string, destination: string): FileOperationResult {
  const suffix = `janissary-${randomUUID()}`;
  const staging = `${destination}.${suffix}.stage`;
  const backup = `${destination}.${suffix}.backup`;
  const copied = runFileOperation(() => fs.cpSync(source, staging, {
    recursive: true,
    errorOnExist: true,
    force: false,
  }));
  if (!copied.ok) {
    removeStagingPath(staging);
    return copied;
  }

  const hadDestination = exists(destination);
  if (hadDestination) {
    const backedUp = renamePath(destination, backup);
    if (!backedUp.ok) {
      removeStagingPath(staging);
      return backedUp;
    }
  }

  const installed = renamePath(staging, destination);
  if (!installed.ok) {
    if (hadDestination) {
      const restored = renamePath(backup, destination);
      if (!restored.ok) {
        removeStagingPath(staging);
        return failureResult(`${installed.reason}; previous destination is preserved at ${backup}`);
      }
    }
    removeStagingPath(staging);
    return installed;
  }

  if (hadDestination) removePath(backup);
  return installed;
}

// Copies `source` to `destination`, recursively for a directory. `errorOnExist` guards the
// non-overwrite case since `cpSync`'s own `force` merges directories rather than replacing them.
export function copyItem(source: string, destination: string, overwrite: boolean): FileOperationResult {
  if (overwrite) return copyWithOverwrite(source, destination);
  return runFileOperation(() => fs.cpSync(source, destination, {
    recursive: true,
    errorOnExist: true,
    force: false,
  }));
}

// What a single-item move answers: the move itself, or — when something already occupies the
// destination and the caller did not ask to replace it — the source that would have overwritten it,
// in the same `conflictPaths` shape the batch move uses.
export type MoveOneResult = FileOperationResult<{ from: string; to: string }> | { conflictPaths: string[] };

// Moves one item into the directory `toRelPath`. An existing entry at the destination is replaced
// only when `overwrite` is set, and then through `moveReplacingDestination`; otherwise the move is
// refused as a conflict before anything on disk changes. A destination that is the source itself (a
// move into the item's own parent) is not a conflict — it stays the no-op rename it always was.
export function moveItem(
  root: string,
  fromRelPath: string,
  toRelPath: string,
  overwrite = false,
): MoveOneResult {
  const source = containedPath(root, fromRelPath);
  const destination = toRelPath ? containedPath(root, toRelPath) : path.resolve(root);
  if (!source || !destination) return failureResult(OUTSIDE_ROOT_REASON);
  const name = path.basename(source);
  const target = path.join(destination, name);
  const occupied = target !== source && exists(target);
  if (occupied && !overwrite) return { conflictPaths: [fromRelPath] };
  const moved = occupied ? moveReplacingDestination(source, target) : renamePath(source, target);
  return moved.ok
    ? { ok: true, value: { from: fromRelPath, to: toRelPath ? `${toRelPath}/${name}` : name } }
    : moved;
}

export type RenameItemResult = FileOperationResult<[string, string]> | { conflict: true };

export function renameItem(
  root: string, relPath: string, newName: string, overwrite = false,
): RenameItemResult {
  if (newName.includes('/') || newName.includes(path.sep)) return failureResult(INVALID_NAME_REASON);
  const oldAbsolute = containedPath(root, relPath);
  if (!oldAbsolute) return failureResult(OUTSIDE_ROOT_REASON);
  const newAbsolute = path.join(path.dirname(oldAbsolute), newName);
  // A new name differing from the old only by case can never be a different entry: where the
  // filesystem folds case the two spellings *are* one path, and where it does not, the destination
  // simply does not exist. So it is answered by the rename itself rather than by the conflict check
  // below, which would otherwise refuse it on a case-folding filesystem that reports a different
  // inode for each spelling — a real filesystem, not a hypothetical one.
  const oldName = path.basename(oldAbsolute);
  const caseOnlyRename = newName !== oldName && newName.toLowerCase() === oldName.toLowerCase();
  if (exists(newAbsolute) && !caseOnlyRename) {
    let sameEntry = false;
    try {
      const [sourceStat, destinationStat] = [fs.lstatSync(oldAbsolute), fs.lstatSync(newAbsolute)];
      sameEntry = sourceStat.dev === destinationStat.dev && sourceStat.ino === destinationStat.ino;
    } catch { /* checked by rename */ }
    if (!sameEntry && !overwrite) return { conflict: true };
  }
  const renamed = renamePath(oldAbsolute, newAbsolute);
  return renamed.ok ? { ok: true, value: [oldAbsolute, newAbsolute] } : renamed;
}

export function deleteItem(root: string, relPath: string): FileOperationResult {
  const absolute = containedPath(root, relPath);
  if (!absolute) return failureResult(OUTSIDE_ROOT_REASON);
  return removePath(absolute);
}
