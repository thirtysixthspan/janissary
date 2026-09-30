import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { compileMatcher, type Matcher } from './compile-matcher.js';
import { filterPaths } from './filter-paths.js';
import { fileMatches, matchFile, splitLines } from './search-files.js';
import type { SearchMatch } from './shared.js';

// The editor tab's own limit, restated rather than imported because a plugin may not reach host
// internals across the import boundary. A match in a file the editor would refuse to open is a row
// that cannot be acted on, and the two numbers are expected to stay equal.
const MAX_BYTES = 2 * 1024 * 1024;

// How many bytes are inspected for the binary test. A null byte in the first few kilobytes is the
// same signal `grep` and `git grep` use, and checking a prefix rather than the whole file is what
// keeps the refusal cheap enough to run on every candidate — at the cost of a file whose null byte
// sits past the prefix being searched as text.
const BINARY_PREFIX = 8192;

// How many files one detection batch covers, and how many of them are read at once inside a batch.
// Both bound how much of the repository a single `updateTab` represents and how many reads are open
// at a time; both are literals because neither has a stated reason to be configurable.
const BATCH_SIZE = 64;
const READ_CONCURRENCY = 8;

// How many rows one search delivers before it settles. Enforced here rather than in the session,
// because the scan is what reads the disk: a cap applied to the rows as they arrive would hide the
// rest while the scan kept reading every file to the end.
const MAX_RESULTS = 250;

export type ScanRead = (absPath: string) => Promise<string>;
export type ScanQuery = {
  query: string;
  include: string;
  exclude: string;
  regex: boolean;
  matchCase: boolean;
  wholeWord: boolean;
};
// A batch of rows as the scan finds them, or the two ways a scan can end without finding anything
// more: `done` when it settled having found what it was going to, `error` when it could not finish.
// The two are distinct — a cancelled scan reports neither, because a scan the user abandoned is not
// a failure — so a failure can never be mistaken for a completion that found nothing.
export type ScanBatch = { rows: SearchMatch[]; done: boolean; error?: string };
export type ScanOptions = {
  // The project's gitignore-aware file list, as project-relative paths plus the directory they are
  // relative to — the same list Quick Open searches, so both see the same set.
  listFiles(): Promise<{ root: string; paths: string[] }>;
  onBatch(batch: ScanBatch): void;
  // Overridable so a test can supply file contents, and file sizes, without a filesystem. The
  // defaults read the real thing; a test that supplies only `readFile` still gets the real size
  // check, so a test asserting the size refusal has to state the size it means.
  readFile?: ScanRead;
  fileSize?: (absPath: string) => Promise<number | null>;
};
export type ScanHandle = { cancel(): void };

type SizeLookup = (absPath: string) => Promise<number | null>;

// One candidate file, carrying both forms so nothing downstream has to rejoin them.
type Candidate = { relPath: string; absPath: string };

// A file the scan cannot or will not read: over the editor's size limit, unreadable, binary, or
// deleted since the list was taken. Each is a normal outcome, never a failure of the scan. A size
// that cannot be read is treated as over the limit, so an unreadable file is skipped rather than
// read and found to be enormous afterwards.
async function readableText(
  absPath: string, read: ScanRead, sizeOf: SizeLookup,
): Promise<string | null> {
  const bytes = await sizeOf(absPath);
  if (bytes === null || bytes > MAX_BYTES) return null;
  let text: string;
  try {
    text = await read(absPath);
  } catch {
    return null;
  }
  if (text.slice(0, BINARY_PREFIX).includes('\0')) return null;
  return text;
}

// Read `paths` with at most `limit` reads open at once, preserving input order in the results so a
// batch's rows arrive in the order the file list gave.
async function readAll(
  paths: readonly string[], read: ScanRead, sizeOf: SizeLookup, limit: number,
): Promise<(string | null)[]> {
  const results: (string | null)[] = Array.from({ length: paths.length }, () => null);
  let next = 0;
  const worker = async () => {
    while (next < paths.length) {
      const index = next++;
      const absPath = paths[index];
      if (absPath === undefined) return;
      results[index] = await readableText(absPath, read, sizeOf);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, paths.length) }, worker));
  return results;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

type Runtime = {
  options: ScanOptions;
  request: ScanQuery;
  read: ScanRead;
  sizeOf: SizeLookup;
  signal: AbortSignal;
  // Rows still to deliver before the search reaches its cap.
  remaining: number;
};

// Phase two: turn every queued candidate into rows, one `onBatch` per file so the table fills
// progressively. Aborted midway, the rows already delivered stand and the rest are dropped. A file
// whose matches straddle the cap gives only the rows that fit, and the queue behind it is not read.
async function deliver(queue: Candidate[], matcher: Matcher, runtime: Runtime): Promise<void> {
  const { options, read, sizeOf, signal } = runtime;
  while (queue.length > 0 && runtime.remaining > 0) {
    if (signal.aborted) return;
    const candidate = queue.shift();
    if (candidate === undefined) return;
    const text = await readableText(candidate.absPath, read, sizeOf);
    if (signal.aborted) return;
    if (text === null) continue;
    const rows = matchFile(candidate.relPath, text, matcher).slice(0, runtime.remaining);
    runtime.remaining -= rows.length;
    if (rows.length > 0) options.onBatch({ rows, done: false });
  }
}

// Phase one over one batch: read it and return the candidates that match at all.
async function detect(
  batch: readonly Candidate[], matcher: Matcher, runtime: Runtime,
): Promise<Candidate[]> {
  const texts = await readAll(
    batch.map((candidate) => candidate.absPath), runtime.read, runtime.sizeOf, READ_CONCURRENCY,
  );
  const found: Candidate[] = [];
  for (const [offset, text] of texts.entries()) {
    const candidate = batch[offset];
    if (text === null || candidate === undefined) continue;
    if (fileMatches(splitLines(text), matcher)) found.push(candidate);
  }
  return found;
}

// The scan proper: list the project, then alternate between detecting which files in the next batch
// match at all and resolving the files already known to match. Resolving always runs first, which is
// the whole of the prioritisation.
async function run(runtime: Runtime): Promise<void> {
  const { options, request, signal } = runtime;
  const matcher = compileMatcher(request.query, request);
  if (!matcher) { options.onBatch({ rows: [], done: true }); return; }
  const listed = await options.listFiles();
  if (signal.aborted) return;
  const candidates: Candidate[] = filterPaths(listed.paths, request.include, request.exclude)
    .map((relPath) => ({ relPath, absPath: path.join(listed.root, relPath) }));
  const pending: Candidate[] = [];

  for (const batch of chunk(candidates, BATCH_SIZE)) {
    if (signal.aborted) return;
    if (runtime.remaining === 0) break;
    pending.push(...await detect(batch, matcher, runtime));
    await deliver(pending, matcher, runtime);
  }

  if (!signal.aborted) options.onBatch({ rows: [], done: true });
}

// Run one search over the project, streaming rows to `onBatch` as they are found.
//
// Two phases, and the second is prioritised over the first. Phase one asks each file only whether it
// matches at all; phase two turns the files that answered yes into rows. A file already known to
// match is always resolved before an unscanned file is detected, so the first rows appear as soon as
// any file resolves rather than only once the scan has worked through the repository in path order.
// Zed measured this design at 16.8 seconds of first-result latency on the Linux kernel before
// prioritising and effectively none after, with throughput unchanged — the cost was the ordering,
// not the scanning.
//
// Cancelling the returned handle aborts the scan. A batch whose signal is already aborted delivers
// nothing, and a read in flight when the abort lands stops feeding rows when it returns.
export function startScan(options: ScanOptions, request: ScanQuery): ScanHandle {
  const read = options.readFile ?? ((absPath) => readFile(absPath, 'utf8'));
  const sizeOf: SizeLookup = options.fileSize ?? (async (absPath) => {
    try {
      const info = await stat(absPath);
      return info.size;
    } catch {
      return null;
    }
  });
  const controller = new AbortController();
  const runtime: Runtime = {
    options, request, read, sizeOf, signal: controller.signal, remaining: MAX_RESULTS,
  };
  // A rejection here would otherwise escape as an unhandled rejection while the tab sat in its
  // searching state forever, so it is reported through the same channel the rows arrive on. A scan
  // the user cancelled is not a failure and reports nothing at all.
  void run(runtime).catch((error: unknown) => {
    if (runtime.signal.aborted) return;
    options.onBatch({ rows: [], done: false, error: oneLine(error) });
  });
  return { cancel: () => controller.abort() };
}

// A failure reason reduced to one line with no stack, the shape the tab body shows and the plugin
// failure path uses. A non-Error is reported as its own text rather than coerced to `[object Object]`.
function oneLine(reason: unknown): string {
  const text = reason instanceof Error ? reason.message : String(reason);
  return (text.split('\n', 1)[0] ?? '').trim().replace(/[.\s]+$/u, '');
}
