import type { Stats } from 'node:fs';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { containedAbsolute } from '../path-containment.js';
import { SECRET_DENY_PATHS } from '../sandbox/paths.js';

export const FILE_POLICY_MAX_BYTES = 5 * 1024 * 1024;

export type FilePolicyFailure = 'File not found' | 'Is a directory' | 'Not a text file' | 'File too large (>5 MB)' | 'Outside the workspace' | 'Secret file' | 'Protected file';

const PROTECTED_SEGMENTS: ReadonlySet<string> = new Set(['.janissary', '.git']);

const SECRET_SEGMENT_RUNS = SECRET_DENY_PATHS.map((entry) => entry.toLowerCase().split('/'));

function containsRun(segments: string[], run: string[]): boolean {
  for (let start = 0; start + run.length <= segments.length; start += 1) {
    if (run.every((segment, index) => segments[start + index] === segment)) return true;
  }
  return false;
}

function isSecretPath(relative: string): boolean {
  const segments = relative.toLowerCase().split(path.sep);
  const last = segments.at(-1) ?? '';
  if (last === '.env' || last.startsWith('.env.')) return true;
  return SECRET_SEGMENT_RUNS.some((run) => containsRun(segments, run));
}

function resolveExisting(location: string): string {
  try {
    return realpathSync(location);
  } catch {
    const parent = path.dirname(location);
    return parent === location ? location : path.join(resolveExisting(parent), path.basename(location));
  }
}

// The reader and the tool writer run outside the sandbox on an agent's behalf, so they must deny
// what the Seatbelt rule built from the same table denies, anchored the same way: each entry under
// the real home directory, in its literal and resolved forms, whatever root the operation started from.
function isUnderHomeSecret(realFile: string): boolean {
  const home = resolveExisting(homedir());
  const file = realFile.toLowerCase();
  return SECRET_DENY_PATHS.some((entry) => {
    const literal = path.join(home, entry);
    return [literal, resolveExisting(literal)].some((location) => containedAbsolute(location.toLowerCase(), file));
  });
}

// The pre-I/O check on the path as requested; it does not replace checkRealTarget.
export function checkLexicalPath(root: string, requested: string): FilePolicyFailure | undefined {
  if (path.isAbsolute(requested)) return 'Outside the workspace';
  const resolved = path.resolve(root, requested);
  if (!containedAbsolute(root, resolved)) return 'Outside the workspace';
  if (isSecretPath(path.relative(root, resolved))) return 'Secret file';
  return isUnderHomeSecret(path.join(resolveExisting(root), path.relative(root, resolved))) ? 'Secret file' : undefined;
}

// realRoot and realTarget must already be canonical paths from realpathSync. For a target that does
// not exist yet, pass the realpath of its nearest existing parent joined with the remaining segments.
// This check resolves nothing about the target by design, so it stays free of target I/O; handed an
// unresolved path, it compares strings only and skips symlink containment.
export function checkRealTarget(realRoot: string, realTarget: string): FilePolicyFailure | undefined {
  if (!containedAbsolute(realRoot, realTarget)) return 'Outside the workspace';
  if (isSecretPath(path.relative(realRoot, realTarget))) return 'Secret file';
  if (isUnderHomeSecret(realTarget)) return 'Secret file';
  return undefined;
}

// Mutation-only: the tool writer refuses the directories holding its own authorization and git's
// executable hooks and config. The reader never calls this, so those files stay readable.
export function checkProtectedPath(relative: string): FilePolicyFailure | undefined {
  return relative.toLowerCase().split(path.sep).some((segment) => PROTECTED_SEGMENTS.has(segment)) ? 'Protected file' : undefined;
}

export function classifyStats(stats: Stats): FilePolicyFailure | undefined {
  if (stats.isDirectory()) return 'Is a directory';
  if (!stats.isFile()) return 'Not a text file';
  if (stats.size > FILE_POLICY_MAX_BYTES) return 'File too large (>5 MB)';
  return undefined;
}
