import { lstatSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { isSameOrDescendantPath, parentPath } from './index.js';
import type { BatchResult, BulkConflictPolicy } from '../protocol.js';
import { moveReplacingDestination } from './filesystem.js';

export type MovePair = { from: string; to: string };
export type MoveManyResult =
  | { conflictPaths: string[] }
  | (BatchResult & { moved: MovePair[]; mutated: boolean });
export type DeleteManyResult = BatchResult & { mutated: boolean };

type Source = { rel: string; abs?: string; valid: boolean; dir: boolean };

function containedPath(root: string, relPath: string): string | undefined {
  if (!relPath || relPath === '.' || relPath === '..' || path.isAbsolute(relPath)) return;
  const absolute = path.resolve(root, relPath);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return;
  return absolute;
}

function sourceInfo(root: string, rel: string): Source {
  const abs = containedPath(root, rel);
  if (!abs) return { rel, valid: false, dir: false };
  try {
    return { rel, abs, valid: true, dir: lstatSync(abs).isDirectory() };
  } catch {
    return { rel, abs, valid: false, dir: false };
  }
}

export function normalizeBatchSources(root: string, paths: string[]): Source[] {
  const unique = paths.filter((candidate, index) => paths.indexOf(candidate) === index);
  const sources = unique.map((candidate) => sourceInfo(root, candidate));
  return sources.filter((source) => sources.every((ancestor) =>
    ancestor === source
    || !ancestor.valid
    || !ancestor.dir
    || !isSameOrDescendantPath(source.rel, ancestor.rel)));
}

function realDirectory(root: string, relPath: string): string | undefined {
  const absolute = relPath === '' ? path.resolve(root) : containedPath(root, relPath);
  if (!absolute) return;
  try {
    const stat = lstatSync(absolute);
    return stat.isDirectory() && !stat.isSymbolicLink() ? absolute : undefined;
  } catch {
    return;
  }
}

function exists(absolute: string): boolean {
  try {
    lstatSync(absolute);
    return true;
  } catch {
    return false;
  }
}

function duplicateNames(sources: Source[]): Set<string> {
  const counts = new Map<string, number>();
  for (const source of sources) {
    if (source.valid) counts.set(path.basename(source.rel), (counts.get(path.basename(source.rel)) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([name]) => name));
}

export function moveBatch(
  root: string,
  sourcePaths: string[],
  destinationPath: string,
  policy?: BulkConflictPolicy,
): MoveManyResult {
  const destination = realDirectory(root, destinationPath);
  const normalized = normalizeBatchSources(root, sourcePaths);
  const attempted = normalized.filter((source) => parentPath(source.rel) !== destinationPath);
  const total = attempted.length;
  if (!destination) return { total, failedPaths: attempted.map((source) => source.rel), moved: [], mutated: false };

  const duplicate = duplicateNames(attempted);
  const eligible = attempted.filter((source) =>
    source.valid
    && !duplicate.has(path.basename(source.rel))
    && !(source.dir && isSameOrDescendantPath(destinationPath, source.rel)));
  const conflicts = eligible.filter((source) => exists(path.join(destination, path.basename(source.rel))));
  if (conflicts.length > 0 && policy === undefined) {
    return { conflictPaths: conflicts.map((source) => source.rel) };
  }

  const moved: MovePair[] = [];
  const failed = new Set(
    attempted
      .filter((source) => !source.valid
        || duplicate.has(path.basename(source.rel))
        || (source.dir && isSameOrDescendantPath(destinationPath, source.rel)))
      .map((source) => source.rel),
  );
  const conflictSet = new Set(conflicts.map((source) => source.rel));
  for (const source of eligible) {
    if (policy === 'skip-conflicts' && conflictSet.has(source.rel)) continue;
    const target = path.join(destination, path.basename(source.rel));
    const didMove = policy === 'overwrite-all'
      ? moveReplacingDestination(source.abs!, target)
      : (() => {
          try {
            renameSync(source.abs!, target);
            return true;
          } catch {
            return false;
          }
        })();
    if (didMove) {
      moved.push({ from: source.rel, to: destinationPath ? `${destinationPath}/${path.basename(source.rel)}` : path.basename(source.rel) });
    } else {
      failed.add(source.rel);
    }
  }
  return {
    total,
    failedPaths: attempted.filter((source) => failed.has(source.rel)).map((source) => source.rel),
    moved,
    mutated: moved.length > 0,
  };
}

export function deleteBatch(root: string, sourcePaths: string[]): DeleteManyResult {
  const normalized = normalizeBatchSources(root, sourcePaths);
  const failedPaths: string[] = [];
  let mutated = false;
  for (const source of normalized) {
    if (!source.valid || !source.abs) {
      failedPaths.push(source.rel);
      continue;
    }
    try {
      rmSync(source.abs, { recursive: true });
      mutated = true;
    } catch {
      failedPaths.push(source.rel);
    }
  }
  return { total: normalized.length, failedPaths, mutated };
}
