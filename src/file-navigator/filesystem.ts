import { lstatSync, renameSync, rmSync } from 'node:fs';
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
