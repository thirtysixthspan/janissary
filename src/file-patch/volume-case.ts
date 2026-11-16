import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';

function alternateCase(name: string): string | undefined {
  const index = name.search(/[A-Za-z]/);
  if (index < 0) return undefined;
  const letter = name[index];
  const flipped = letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase();
  return `${name.slice(0, index)}${flipped}${name.slice(index + 1)}`;
}

function sameEntry(left: string, right: string): boolean {
  try {
    const one = lstatSync(left);
    const other = lstatSync(right);
    return one.dev === other.dev && one.ino === other.ino && realpathSync.native(left) === realpathSync.native(right);
  } catch {
    return false;
  }
}

function probeEntries(folder: string): boolean | undefined {
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch {
    return undefined;
  }
  for (const name of names) {
    const alternate = alternateCase(name);
    if (alternate !== undefined) return sameEntry(path.join(folder, name), path.join(folder, alternate));
  }
  return undefined;
}

function probeName(candidate: string): boolean | undefined {
  const alternate = alternateCase(path.basename(candidate));
  const parent = path.dirname(candidate);
  if (alternate === undefined || parent === candidate) return undefined;
  return sameEntry(candidate, path.join(parent, alternate));
}

export function volumeIgnoresCase(root: string): boolean {
  const resolved = path.resolve(root);
  return probeEntries(resolved) ?? probeName(resolved) ?? false;
}
