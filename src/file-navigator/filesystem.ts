import { cpSync, lstatSync, renameSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

function exists(absolute: string): boolean {
  try {
    lstatSync(absolute);
    return true;
  } catch {
    return false;
  }
}

export function moveReplacingDestination(source: string, destination: string): boolean {
  if (!exists(destination)) {
    try {
      renameSync(source, destination);
      return true;
    } catch {
      return false;
    }
  }
  const backup = `${destination}.janissary-${randomUUID()}`;
  try {
    renameSync(destination, backup);
  } catch {
    return false;
  }
  try {
    renameSync(source, destination);
  } catch {
    try { renameSync(backup, destination); } catch { /* best effort restoration */ }
    return false;
  }
  try { rmSync(backup, { recursive: true }); } catch { /* destination already moved safely */ }
  return true;
}

// Copies `source` to `destination`, recursively for a directory. `errorOnExist` guards the
// non-overwrite case since `cpSync`'s own `force` merges directories rather than replacing them;
// an overwrite instead removes the destination first, then copies fresh. Deliberately does not
// stage a backup the way `moveReplacingDestination` does — a mid-overwrite failure here leaves the
// destination gone, which is acceptable because the source (unlike a move) still exists.
export function copyItem(source: string, destination: string, overwrite: boolean): boolean {
  try {
    if (overwrite) {
      try { rmSync(destination, { recursive: true }); } catch { /* nothing to remove */ }
    }
    cpSync(source, destination, { recursive: true, errorOnExist: !overwrite, force: false });
    return true;
  } catch {
    return false;
  }
}

export function moveItem(
  root: string,
  fromRelPath: string,
  toRelPath: string,
): { from: string; to: string } | undefined {
  const source = path.join(root, fromRelPath);
  const name = path.basename(source);
  try {
    renameSync(source, path.join(root, toRelPath, name));
  } catch {
    return;
  }
  return { from: fromRelPath, to: toRelPath ? `${toRelPath}/${name}` : name };
}

export function renameItem(root: string, relPath: string, newName: string): [string, string] | undefined {
  if (newName.includes('/') || newName.includes(path.sep)) return;
  const oldAbsolute = path.join(root, relPath);
  const newAbsolute = path.join(path.dirname(oldAbsolute), newName);
  try {
    renameSync(oldAbsolute, newAbsolute);
  } catch {
    return;
  }
  return [oldAbsolute, newAbsolute];
}

export function deleteItem(root: string, relPath: string): boolean {
  try {
    rmSync(path.join(root, relPath), { recursive: true });
    return true;
  } catch {
    return false;
  }
}
