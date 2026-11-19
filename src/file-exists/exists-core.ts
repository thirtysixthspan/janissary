import { constants, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileFailureLine } from '../file-failure.js';
import { readRowStat } from '../file-navigator/stats.js';
import { canonicalPath } from '../file-read/canonical.js';
import { checkLexicalPath, checkRealTarget } from '../file-read/policy.js';

const { S_IFDIR, S_IFLNK, S_IFMT, S_IFREG } = constants;

const TYPE_WORDS = new Map<number, string>([
  [S_IFREG, 'file'],
  [S_IFDIR, 'dir'],
  [S_IFLNK, 'link'],
]);

function typeWord(mode: number): string {
  return TYPE_WORDS.get(mode & S_IFMT) ?? 'file';
}

function isAbsentPathError(error: unknown): boolean {
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

// Resolve the nearest existing ancestor so an escaping symlink still reaches checkRealTarget and a
// dangling link keeps its own spelling for readRowStat's lstat.
function resolveExisting(location: string): string {
  try {
    return realpathSync(location);
  } catch {
    const parent = path.dirname(location);
    return parent === location ? location : path.join(resolveExisting(parent), path.basename(location));
  }
}

function resolveRealTarget(root: string, requested: string): { realRoot: string; realTarget: string } | { result: string } {
  const target = path.resolve(root, requested);
  try {
    return { realRoot: canonicalPath(root), realTarget: canonicalPath(target) };
  } catch (error) {
    if (!isAbsentPathError(error)) return { result: 'forbidden' };
    try {
      return { realRoot: canonicalPath(root), realTarget: resolveExisting(target) };
    } catch {
      return { result: 'forbidden' };
    }
  }
}

export function fileExists(root: string, requested: string): string {
  const lexicalFailure = checkLexicalPath(root, requested);
  if (lexicalFailure !== undefined) return fileFailureLine(lexicalFailure, requested) ?? 'forbidden';
  const resolved = resolveRealTarget(root, requested);
  if ('result' in resolved) return resolved.result;
  const targetFailure = checkRealTarget(resolved.realRoot, resolved.realTarget);
  if (targetFailure !== undefined) return fileFailureLine(targetFailure, requested) ?? 'forbidden';
  const stat = readRowStat(path.resolve(root, requested));
  if (stat === null) return 'missing';
  return typeWord(stat.mode);
}
