import { lstatSync } from 'node:fs';
import path from 'node:path';
import { isSameOrDescendantPath, parentPath } from './index.js';
import { containedPath, duplicateNames, exists, realDirectory } from './batch-paths.js';
import type { BatchResult, BulkConflictPolicy } from '../protocol.js';
import { moveReplacingDestination, removePath, renamePath } from './filesystem.js';
import {
  DESCENDANT_DESTINATION_REASON,
  DESTINATION_UNAVAILABLE_REASON,
  DUPLICATE_NAME_REASON,
  failureReasons,
  fileOperationReason,
  OUTSIDE_ROOT_REASON,
  SOURCE_UNAVAILABLE_REASON,
} from './file-operation-result.js';

export type MovePair = { from: string; to: string };
export type MoveManyResult =
  | { conflictPaths: string[] }
  | (BatchResult & { moved: MovePair[]; mutated: boolean });
export type DeleteManyResult = BatchResult & { mutated: boolean };

type Source = { rel: string; abs?: string; valid: boolean; dir: boolean; reason?: string };

function sourceInfo(root: string, rel: string): Source {
  const abs = containedPath(root, rel);
  if (!abs) return { rel, valid: false, dir: false, reason: OUTSIDE_ROOT_REASON };
  try {
    return { rel, abs, valid: true, dir: lstatSync(abs).isDirectory() };
  } catch (error) {
    return { rel, abs, valid: false, dir: false, reason: fileOperationReason(error) };
  }
}

function canMoveSource(source: Source, duplicates: Set<string>, destinationPath: string): boolean {
  return source.valid
    && !duplicates.has(path.basename(source.rel))
    && !(source.dir && isSameOrDescendantPath(destinationPath, source.rel));
}

function initialMoveFailures(
  attempted: Source[],
  eligible: Source[],
  duplicate: Set<string>,
): { failed: Set<string>; reasons: Map<string, string> } {
  const eligibleSet = new Set(eligible);
  const failed = new Set<string>();
  const reasons = new Map<string, string>();
  for (const source of attempted) {
    if (eligibleSet.has(source)) continue;
    failed.add(source.rel);
    const reason = source.reason
      ?? (duplicate.has(path.basename(source.rel)) ? DUPLICATE_NAME_REASON
        : source.dir ? DESCENDANT_DESTINATION_REASON : SOURCE_UNAVAILABLE_REASON);
    reasons.set(source.rel, reason);
  }
  return { failed, reasons };
}

function performMoves(
  eligible: Source[],
  destination: string,
  destinationPath: string,
  policy: BulkConflictPolicy | undefined,
  conflictSet: Set<string>,
  failed: Set<string>,
  reasons: Map<string, string>,
): MovePair[] {
  const moved: MovePair[] = [];
  for (const source of eligible) {
    if (policy === 'skip-conflicts' && conflictSet.has(source.rel)) continue;
    const name = path.basename(source.rel);
    const movedResult = policy === 'overwrite-all'
      ? moveReplacingDestination(source.abs!, path.join(destination, name))
      : renamePath(source.abs!, path.join(destination, name));
    if (movedResult.ok) {
      moved.push({ from: source.rel, to: destinationPath ? `${destinationPath}/${name}` : name });
    } else {
      failed.add(source.rel);
      reasons.set(source.rel, movedResult.reason);
    }
  }
  return moved;
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
  if (!destination) {
    const reasons = new Map(attempted.map((source) => [source.rel, DESTINATION_UNAVAILABLE_REASON]));
    return { total, failedPaths: attempted.map((source) => source.rel), ...failureReasons(reasons), moved: [], mutated: false };
  }

  const duplicate = duplicateNames(attempted);
  const eligible = attempted.filter((source) => canMoveSource(source, duplicate, destinationPath));
  const conflicts = eligible.filter((source) => exists(path.join(destination, path.basename(source.rel))));
  if (conflicts.length > 0 && policy === undefined) {
    return { conflictPaths: conflicts.map((source) => source.rel) };
  }

  const conflictSet = new Set(conflicts.map((source) => source.rel));
  const { failed, reasons } = initialMoveFailures(attempted, eligible, duplicate);
  const moved = performMoves(eligible, destination, destinationPath, policy, conflictSet, failed, reasons);
  return {
    total,
    failedPaths: attempted.filter((source) => failed.has(source.rel)).map((source) => source.rel),
    ...failureReasons(reasons),
    moved,
    mutated: moved.length > 0,
  };
}

export function deleteBatch(root: string, sourcePaths: string[]): DeleteManyResult {
  const normalized = normalizeBatchSources(root, sourcePaths);
  const failedPaths: string[] = [];
  const reasons = new Map<string, string>();
  let mutated = false;
  for (const source of normalized) {
    if (!source.valid || !source.abs) {
      failedPaths.push(source.rel);
      reasons.set(source.rel, source.reason ?? SOURCE_UNAVAILABLE_REASON);
      continue;
    }
    const removal = removePath(source.abs);
    if (removal.ok) {
      mutated = true;
    } else {
      failedPaths.push(source.rel);
      reasons.set(source.rel, removal.reason);
    }
  }
  return { total: normalized.length, failedPaths, ...failureReasons(reasons), mutated };
}
