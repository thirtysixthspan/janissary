import { cpSync, lstatSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { containedPath } from './batch-paths.js';
import {
  failureResult,
  INVALID_NAME_REASON,
  OUTSIDE_ROOT_REASON,
  runFileOperation,
  type FileOperationResult,
} from './file-operation-result.js';

function exists(absolute: string): boolean {
  try {
    lstatSync(absolute);
    return true;
  } catch {
    return false;
  }
}

export function renamePath(source: string, destination: string): FileOperationResult {
  return runFileOperation(() => renameSync(source, destination));
}

export function removePath(absolute: string): FileOperationResult {
  return runFileOperation(() => rmSync(absolute, { recursive: true }));
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

// Copies `source` to `destination`, recursively for a directory. `errorOnExist` guards the
// non-overwrite case since `cpSync`'s own `force` merges directories rather than replacing them;
// an overwrite instead removes the destination first, then copies fresh. Deliberately does not
// stage a backup the way `moveReplacingDestination` does — a mid-overwrite failure here leaves the
// destination gone, which is acceptable because the source (unlike a move) still exists.
export function copyItem(source: string, destination: string, overwrite: boolean): FileOperationResult {
  if (overwrite && exists(destination)) {
    const removal = removePath(destination);
    if (!removal.ok) return removal;
  }
  return runFileOperation(() =>
    cpSync(source, destination, { recursive: true, errorOnExist: !overwrite, force: false }));
}

export function moveItem(
  root: string,
  fromRelPath: string,
  toRelPath: string,
): FileOperationResult<{ from: string; to: string }> {
  const source = containedPath(root, fromRelPath);
  const destination = toRelPath ? containedPath(root, toRelPath) : path.resolve(root);
  if (!source || !destination) return failureResult(OUTSIDE_ROOT_REASON);
  const name = path.basename(source);
  const moved = renamePath(source, path.join(destination, name));
  return moved.ok
    ? { ok: true, value: { from: fromRelPath, to: toRelPath ? `${toRelPath}/${name}` : name } }
    : moved;
}

export function renameItem(root: string, relPath: string, newName: string): FileOperationResult<[string, string]> {
  if (newName.includes('/') || newName.includes(path.sep)) return failureResult(INVALID_NAME_REASON);
  const oldAbsolute = containedPath(root, relPath);
  if (!oldAbsolute) return failureResult(OUTSIDE_ROOT_REASON);
  const newAbsolute = path.join(path.dirname(oldAbsolute), newName);
  const renamed = renamePath(oldAbsolute, newAbsolute);
  return renamed.ok ? { ok: true, value: [oldAbsolute, newAbsolute] } : renamed;
}

export function deleteItem(root: string, relPath: string): FileOperationResult {
  const absolute = containedPath(root, relPath);
  if (!absolute) return failureResult(OUTSIDE_ROOT_REASON);
  return removePath(absolute);
}
