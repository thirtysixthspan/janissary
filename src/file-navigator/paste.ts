import { lstatSync, renameSync } from 'node:fs';
import path from 'node:path';
import { exists, realDirectory } from './batch-paths.js';
import { copyItem, moveReplacingDestination } from './filesystem.js';
import { nextFreeName } from '../editor/next-free-name.js';
import type { BatchResult, BulkConflictPolicy } from '../protocol.js';

export type PastePair = { from: string; to: string };
export type PasteManyResult =
  | { conflictPaths: string[] }
  | (BatchResult & { pairs: PastePair[]; mutated: boolean });

type Source = { abs: string; valid: boolean; dir: boolean };

function sourceInfo(abs: string): Source {
  try {
    return { abs, valid: true, dir: lstatSync(abs).isDirectory() };
  } catch {
    return { abs, valid: false, dir: false };
  }
}

// Absolute-path version of `isSameOrDescendantPath` (`index.ts`) — the clipboard's sources are
// absolute and may lie outside the pasting tab's root, so the tree-relative helper doesn't apply.
function isSameOrDescendantAbsolute(candidate: string, base: string): boolean {
  return candidate === base || candidate.startsWith(`${base}${path.sep}`);
}

// Dedupe, then drop any source nested inside another selected source directory — mirrors
// `normalizeBatchSources` in `batch.ts`, but over absolute paths with a plain `lstatSync` existence
// check rather than `realDirectory` containment (decision 14: sources need not resolve inside any
// particular root).
function normalizeSources(sources: string[]): Source[] {
  const unique = sources.filter((candidate, index) => sources.indexOf(candidate) === index);
  const infos = unique.map((abs) => sourceInfo(abs));
  return infos.filter((source) => infos.every((ancestor) =>
    ancestor === source
    || !ancestor.valid
    || !ancestor.dir
    || !isSameOrDescendantAbsolute(source.abs, ancestor.abs)));
}

function tryRename(source: string, destination: string): boolean {
  try {
    renameSync(source, destination);
    return true;
  } catch {
    return false;
  }
}

type Classified = { attempted: Source[]; eligible: Source[]; rejected: Set<string>; renamed: Map<string, string> };

// The sources actually attempted (a cut back into its own directory is a silent no-op, never
// attempted), split into the ones eligible to paste and the ones rejected outright (invalid, or a
// directory whose destination lies inside itself). A copy landing in its own source directory
// always auto-renames via `nextFreeName` rather than conflicting — recorded in `renamed`.
function classifySources(normalized: Source[], destination: string, mode: 'copy' | 'cut'): Classified {
  const attempted = normalized.filter((source) => !(mode === 'cut' && path.dirname(source.abs) === destination));
  const rejected = new Set(
    attempted
      .filter((source) => !source.valid
        || (source.dir && isSameOrDescendantAbsolute(destination, source.abs)))
      .map((source) => source.abs),
  );
  const eligible = attempted.filter((source) => !rejected.has(source.abs));
  const renamed = new Map<string, string>();
  for (const source of eligible) {
    if (mode === 'copy' && path.dirname(source.abs) === destination) {
      renamed.set(source.abs, nextFreeName(destination, path.basename(source.abs)));
    }
  }
  return { attempted, eligible, rejected, renamed };
}

// The eligible sources whose target name already exists at the destination — skipped for a source
// already resolved to an auto-rename, since that never conflicts.
function preflightConflicts(eligible: Source[], destination: string, renamed: Map<string, string>): Source[] {
  return eligible.filter((source) =>
    !renamed.has(source.abs) && exists(path.join(destination, path.basename(source.abs))));
}

// Performs each eligible paste (skipping a conflict under `skip-conflicts`), returning the pairs
// that succeeded and the set of sources that failed.
function performPastes(
  eligible: Source[],
  destination: string,
  mode: 'copy' | 'cut',
  policy: BulkConflictPolicy | undefined,
  renamed: Map<string, string>,
  conflictSet: Set<string>,
): { pairs: PastePair[]; failed: Set<string> } {
  const pairs: PastePair[] = [];
  const failed = new Set<string>();
  for (const source of eligible) {
    if (policy === 'skip-conflicts' && conflictSet.has(source.abs)) continue;
    const name = renamed.get(source.abs) ?? path.basename(source.abs);
    const target = path.join(destination, name);
    const overwrite = policy === 'overwrite-all' && conflictSet.has(source.abs);
    const ok = mode === 'copy'
      ? copyItem(source.abs, target, overwrite)
      : (overwrite ? moveReplacingDestination(source.abs, target) : tryRename(source.abs, target));
    if (ok) pairs.push({ from: source.abs, to: target });
    else failed.add(source.abs);
  }
  return { pairs, failed };
}

// `pasteBatch` mirrors `moveBatch`'s shape (normalize → preflight conflicts → perform), but for a
// copy or cut-paste whose sources are absolute paths from the app-wide clipboard.
export function pasteBatch(
  root: string,
  sources: string[],
  destinationPath: string,
  mode: 'copy' | 'cut',
  policy?: BulkConflictPolicy,
): PasteManyResult {
  const destination = realDirectory(root, destinationPath);
  const normalized = normalizeSources(sources);
  if (!destination) {
    return { total: normalized.length, failedPaths: normalized.map((source) => source.abs), pairs: [], mutated: false };
  }

  const { attempted, eligible, rejected, renamed } = classifySources(normalized, destination, mode);
  const conflicts = preflightConflicts(eligible, destination, renamed);
  if (conflicts.length > 0 && policy === undefined) {
    return { conflictPaths: conflicts.map((source) => source.abs) };
  }

  const conflictSet = new Set(conflicts.map((source) => source.abs));
  const { pairs, failed: failedPastes } = performPastes(eligible, destination, mode, policy, renamed, conflictSet);
  const failed = new Set(rejected);
  for (const abs of failedPastes) failed.add(abs);

  return {
    total: attempted.length,
    failedPaths: attempted.filter((source) => failed.has(source.abs)).map((source) => source.abs),
    pairs,
    mutated: pairs.length > 0,
  };
}
