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

async function hasRealDirectories(realRoot: string, relative: string): Promise<boolean> {
  const segments = relative.split(path.sep).slice(0, -1);
  let current = realRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    const info = await lstat(current);
    if (!info.isDirectory()) return false;
  }
  return true;
}

async function readCandidate(realRoot: string, check: TargetCheck, relPath: string): Promise<string | null> {
  try {
    const candidate = resolveCandidate(realRoot, relPath);
    if (candidate === undefined || isSecretPath(candidate.relative)) return null;
    if (check(candidate.absolute) !== undefined) return null;
    if (!(await hasRealDirectories(realRoot, candidate.relative))) return null;
    const info = await lstat(candidate.absolute);
    if (!info.isFile() || info.size > SEARCH_MAX_FILE_BYTES) return null;
    const canonical = await realpath(candidate.absolute);
    if (canonical !== candidate.absolute || check(canonical) !== undefined) return null;
    const contents = await readFile(candidate.absolute);
    return contents.subarray(0, SEARCH_BINARY_PREFIX_BYTES).includes(0) ? null : contents.toString('utf8');
  } catch {
    return null;
  }
}

export async function createCandidateReader(root: string): Promise<CandidateReader> {
  try {
    const realRoot = await realpath(root);
    const check = createRealTargetCheck(realRoot);
    if (check(realRoot) !== undefined) return async () => null;
    return (relPath) => readCandidate(realRoot, check, relPath);
  } catch {
    return async () => null;
  }
}
