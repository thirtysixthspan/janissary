import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createRealTargetCheck, isSecretPath } from '../file-read/policy.js';
import { containedStrictly } from '../path-containment.js';
import { SEARCH_BINARY_PREFIX_BYTES, SEARCH_MAX_FILE_BYTES } from '../search/types.js';

export type CandidateReader = (relPath: string) => Promise<string | null>;

type TargetCheck = ReturnType<typeof createRealTargetCheck>;

interface CandidatePath {
  absolute: string;
  relative: string;
}

function resolveCandidate(realRoot: string, relPath: string): CandidatePath | undefined {
  if (!relPath || path.isAbsolute(relPath)) return;
  const absolute = path.resolve(realRoot, relPath);
  if (!containedStrictly(realRoot, absolute)) return;
  return { absolute, relative: path.relative(realRoot, absolute) };
}

function isAborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

async function hasRealDirectories(realRoot: string, relative: string, signal?: AbortSignal): Promise<boolean> {
  const segments = relative.split(path.sep).slice(0, -1);
  let current = realRoot;
  for (const segment of segments) {
    if (isAborted(signal)) return false;
    current = path.join(current, segment);
    const info = await lstat(current);
    if (isAborted(signal) || !info.isDirectory()) return false;
  }
  return true;
}

async function readCandidate(
  realRoot: string, check: TargetCheck, relPath: string, signal?: AbortSignal,
): Promise<string | null> {
  try {
    if (isAborted(signal)) return null;
    const candidate = resolveCandidate(realRoot, relPath);
    if (candidate === undefined || isSecretPath(candidate.relative)) return null;
    if (check(candidate.absolute) !== undefined) return null;
    if (!(await hasRealDirectories(realRoot, candidate.relative, signal))) return null;
    if (isAborted(signal)) return null;
    const info = await lstat(candidate.absolute);
    if (isAborted(signal) || !info.isFile() || info.size > SEARCH_MAX_FILE_BYTES) return null;
    const canonical = await realpath(candidate.absolute);
    if (isAborted(signal) || canonical !== candidate.absolute || check(canonical) !== undefined) return null;
    if (isAborted(signal)) return null;
    const contents = await readFile(candidate.absolute, { signal });
    return contents.subarray(0, SEARCH_BINARY_PREFIX_BYTES).includes(0) ? null : contents.toString('utf8');
  } catch {
    return null;
  }
}

export async function createCandidateReader(root: string, signal?: AbortSignal): Promise<CandidateReader> {
  if (isAborted(signal)) return async () => null;
  try {
    const realRoot = await realpath(root);
    if (isAborted(signal)) return async () => null;
    const check = createRealTargetCheck(realRoot);
    if (check(realRoot) !== undefined) return async () => null;
    return (relPath) => readCandidate(realRoot, check, relPath, signal);
  } catch {
    return async () => null;
  }
}
