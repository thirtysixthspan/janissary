import { lstatSync, readdirSync, realpathSync } from 'node:fs';
import type { Stats } from 'node:fs';
import path from 'node:path';

function alternateCase(name: string): string | undefined {
  const index = name.search(/[A-Za-z]/);
  if (index < 0) return undefined;
  const letter = name[index];
  const flipped = letter === letter.toLowerCase() ? letter.toUpperCase() : letter.toLowerCase();
  return `${name.slice(0, index)}${flipped}${name.slice(index + 1)}`;
}

function sameEntry(left: string, right: string): boolean | undefined {
  let one: Stats;
  try {
    one = lstatSync(left);
  } catch {
    return undefined;
  }
  let other: Stats;
  try {
    other = lstatSync(right);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'ENOENT' ? false : undefined;
  }
  if (one.dev !== other.dev || one.ino !== other.ino) return false;
  try {
    return realpathSync.native(left) === realpathSync.native(right);
  } catch {
    return undefined;
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
    if (alternate === undefined) continue;
    const verdict = sameEntry(path.join(folder, name), path.join(folder, alternate));
    if (verdict !== undefined) return verdict;
  }
  return undefined;
}

function probeAncestorEntries(candidate: string): boolean | undefined {
  const folder = path.dirname(candidate);
  const verdict = probeEntries(folder);
  if (verdict !== undefined) return verdict;
  const parent = path.dirname(folder);
  return parent === folder ? undefined : probeAncestorEntries(folder);
}

function probeName(candidate: string): boolean | undefined {
  const alternate = alternateCase(path.basename(candidate));
  const parent = path.dirname(candidate);
  if (alternate === undefined || parent === candidate) return undefined;
  return sameEntry(candidate, path.join(parent, alternate));
}

export function volumeIgnoresCase(root: string): boolean {
  const resolved = path.resolve(root);
  return probeEntries(resolved) ?? probeName(resolved) ?? probeAncestorEntries(resolved) ?? false;
}
