import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { patternError } from './compile-matcher.js';
import { filterPaths } from './filter-paths.js';
import { splitLines } from './search-files.js';
import { createMatcherWorker } from './matching-worker.js';
import { scanRemoteCandidates } from './scan-remote.js';
import type { MatcherWorker } from './matcher-worker-protocol.js';
import type { SearchMatch } from './shared.js';

// The editor tab's own limit, restated rather than imported because a plugin may not reach host
// internals across the import boundary. A match in a file the editor would refuse to open is a row
// that cannot be acted on, and the two numbers are expected to stay equal.
export const MAX_BYTES = 2 * 1024 * 1024;

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
export type ScanReadCandidate = (absPath: string, relPath: string) => Promise<string | null>;
export type ScanQuery = {
  query: string;
  include: string;
  exclude: string;
  regex: boolean;
  matchCase: boolean;
  wholeWord: boolean;
};
export type ScanMatcherFactory = (request: ScanQuery, signal: AbortSignal) => MatcherWorker;
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
  // Reads a candidate in one call in place of the size-then-read pair, answering null to skip it,
  // which is what a remote workspace needs when each read is a capability call.
  readCandidate?: ScanReadCandidate;
  createMatcher?: ScanMatcherFactory;
};
export type ScanHandle = { cancel(): void };

type SizeLookup = (absPath: string) => Promise<number | null>;

// One candidate file, carrying both forms so nothing downstream has to rejoin them.
type Candidate = { relPath: string; absPath: string };

// A file the scan cannot or will not read: over the editor's size limit, unreadable, binary, or
// deleted since the list was taken. Each is a normal outcome, never a failure of the scan. A size
// that cannot be read is treated as over the limit, so an unreadable file is skipped rather than
// read and found to be enormous afterwards.
async function readableText(candidate: Candidate, runtime: Runtime): Promise<string | null> {
  const { absPath, relPath } = candidate;
  let text: string | null;
  try {
    if (runtime.readCandidate === undefined) {
      const bytes = await runtime.sizeOf(absPath);
      if (bytes === null || bytes > MAX_BYTES) return null;
      text = await runtime.read(absPath);
    } else {
      text = await runtime.readCandidate(absPath, relPath);
    }
  } catch {
    return null;
  }
  if (text === null) return null;
  if (text.slice(0, BINARY_PREFIX).includes('\0')) return null;
  return text;
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
  readCandidate?: ScanReadCandidate;
  createMatcher: NonNullable<ScanOptions['createMatcher']>;
  signal: AbortSignal;
  // Rows still to deliver before the search reaches its cap.
  remaining: number;
};

// Check a batch with bounded read concurrency, but consume outcomes in path order. This lets a
// resolved early match publish without waiting for every other file in the batch.
async function scanBatch(batch: readonly Candidate[], matcher: MatcherWorker, runtime: Runtime): Promise<void> {
  const { options, signal } = runtime;
  const reads = new Map<number, Promise<string | null>>();
  let next = 0;
  const schedule = () => {
    while (next < batch.length && reads.size < READ_CONCURRENCY) {
      const index = next++;
      const candidate = batch[index];
      if (candidate !== undefined) reads.set(index, readableText(candidate, runtime));
    }
  };

  schedule();
  for (const [index, candidate] of batch.entries()) {
    if (signal.aborted || runtime.remaining === 0) return;
    const read = reads.get(index);
    if (read === undefined) continue;
    reads.delete(index);
    schedule();
    const text = await read;
    if (signal.aborted) return;
    if (text === null || !await matcher.detect(splitLines(text))) continue;
    const matchedRows = await matcher.rows(candidate.relPath, text);
    const rows = matchedRows.slice(0, runtime.remaining);
    runtime.remaining -= rows.length;
    if (rows.length > 0) options.onBatch({ rows, done: false });
  }
}

// The scan proper: list the project, then alternate between detecting which files in the next batch
// match at all and resolving the files already known to match. Resolving always runs first, which is
// the whole of the prioritisation.
async function run(runtime: Runtime): Promise<void> {
  const { options, request, signal } = runtime;
  if (request.query === '' || patternError(request.query, request) !== null) {
    options.onBatch({ rows: [], done: true });
    return;
  }
  const matcher = runtime.createMatcher(request, signal);
  try {
    const listed = await options.listFiles();
    if (signal.aborted) return;
    const candidates: Candidate[] = filterPaths(listed.paths, request.include, request.exclude)
      .map((relPath) => ({ relPath, absPath: path.join(listed.root, relPath) }));
    if (runtime.readCandidate !== undefined) {
      await scanRemoteCandidates({
        candidates, readCandidate: runtime.readCandidate, matcher, signal,
        onBatch: options.onBatch,
      });
      if (!signal.aborted) options.onBatch({ rows: [], done: true });
      return;
    }
    for (const batch of chunk(candidates, BATCH_SIZE)) {
      if (signal.aborted) return;
      if (runtime.remaining === 0) break;
      await scanBatch(batch, matcher, runtime);
    }

    if (!signal.aborted) options.onBatch({ rows: [], done: true });
  } finally {
    matcher.dispose();
  }
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
    options, request, read, sizeOf, readCandidate: options.readCandidate, signal: controller.signal,
    createMatcher: options.createMatcher
      ?? ((search, signal) => createMatcherWorker(search.query, search, signal)),
    remaining: MAX_RESULTS,
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
