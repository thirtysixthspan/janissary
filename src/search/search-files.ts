import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createRealTargetCheck, isSecretPath } from '../file-read/policy.js';
import { containedStrictly } from '../path-containment.js';
import type { Matcher } from './compile-matcher.js';
import {
  SEARCH_BINARY_PREFIX_BYTES, SEARCH_MAX_FILE_BYTES, type SearchMatch,
} from './types.js';

// How many lines of context a match carries either side. Clipped at the start and end of a file
// rather than padded, so a block may hold fewer than this many lines on either side.
const CONTEXT = 2;

// Split file text into lines, dropping a single trailing newline so a file ending in a newline does
// not contribute a phantom final line. Empty text yields no lines at all, while a file holding only
// a newline is the one empty line it plainly is.
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const withoutFinalNewline = text.endsWith('\n') ? text.slice(0, -1) : text;
  return withoutFinalNewline === '' ? [''] : withoutFinalNewline.split('\n');
}

// Whether any line of a file matches. The cheap question the scan's first phase asks, and it must
// agree exactly with `matchFile` finding at least one row — the two are the same test over the same
// lines, so a file that answers yes here is a file `matchFile` will produce rows for.
export function fileMatches(lines: readonly string[], matcher: Matcher): boolean {
  return lines.some((line) => matcher.test(line));
}

// Every match in one file, as self-describing rows: the path, the 1-based line number, the match
// line itself with where its first match sits, and up to two lines of context either side.
export function matchFile(relPath: string, text: string, matcher: Matcher): SearchMatch[] {
  const lines = splitLines(text);
  const rows: SearchMatch[] = [];
  for (const [index, line] of lines.entries()) {
    const span = matcher.locate(line);
    if (!span) continue;
    rows.push({
      path: relPath,
      line: index + 1,
      above: lines.slice(Math.max(0, index - CONTEXT), index),
      match: line,
      start: span.start,
      end: span.end,
      below: lines.slice(index + 1, Math.min(lines.length, index + 1 + CONTEXT)),
    });
  }
  return rows;
}

// The one reader for candidate files in every search pipeline. It owns the workspace's file-safety
// policy — secret paths, real-target and symlink containment, size and binary refusal — so a file
// a caller refuses in one command is refused in all of them. `io` is injectable so a test can supply
// file contents and metadata without a filesystem; production uses the real filesystem operations.
export type CandidateReader = (relPath: string) => Promise<string | null>;
export type CandidateIo = {
  lstat(target: string): Promise<{ isFile(): boolean; isDirectory(): boolean; size: number }>;
  realpath(target: string): Promise<string>;
  readFile(target: string, options: { signal?: AbortSignal }): Promise<Buffer>;
};

const realCandidateIo: CandidateIo = {
  lstat: (target) => lstat(target),
  realpath: (target) => realpath(target),
  readFile: (target, options) => readFile(target, options),
};

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

async function hasRealDirectories(
  realRoot: string, relative: string, signal: AbortSignal | undefined, io: CandidateIo,
): Promise<boolean> {
  const segments = relative.split(path.sep).slice(0, -1);
  let current = realRoot;
  for (const segment of segments) {
    if (isAborted(signal)) return false;
    current = path.join(current, segment);
    const info = await io.lstat(current);
    if (isAborted(signal) || !info.isDirectory()) return false;
  }
  return true;
}

async function readCandidate(
  realRoot: string, check: TargetCheck, relPath: string, signal: AbortSignal | undefined, io: CandidateIo,
): Promise<string | null> {
  try {
    if (isAborted(signal)) return null;
    const candidate = resolveCandidate(realRoot, relPath);
    if (candidate === undefined || isSecretPath(candidate.relative)) return null;
    if (check(candidate.absolute) !== undefined) return null;
    if (!(await hasRealDirectories(realRoot, candidate.relative, signal, io))) return null;
    if (isAborted(signal)) return null;
    const info = await io.lstat(candidate.absolute);
    if (isAborted(signal) || !info.isFile() || info.size > SEARCH_MAX_FILE_BYTES) return null;
    const canonical = await io.realpath(candidate.absolute);
    if (isAborted(signal) || canonical !== candidate.absolute || check(canonical) !== undefined) return null;
    if (isAborted(signal)) return null;
    const contents = await io.readFile(candidate.absolute, { signal });
    return contents.subarray(0, SEARCH_BINARY_PREFIX_BYTES).includes(0) ? null : contents.toString('utf8');
  } catch {
    return null;
  }
}

export async function createCandidateReader(
  root: string, signal?: AbortSignal, io: CandidateIo = realCandidateIo,
): Promise<CandidateReader> {
  if (isAborted(signal)) return async () => null;
  try {
    const realRoot = await io.realpath(root);
    if (isAborted(signal)) return async () => null;
    const check = createRealTargetCheck(realRoot);
    if (check(realRoot) !== undefined) return async () => null;
    return (relPath) => readCandidate(realRoot, check, relPath, signal, io);
  } catch {
    return async () => null;
  }
}
