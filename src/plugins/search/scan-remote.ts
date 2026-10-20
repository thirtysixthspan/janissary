import type { MatcherWorker } from './matcher-worker-protocol.js';
import type { SearchMatch } from './shared.js';
import type { ScanReadCandidate } from './scan.js';

const READ_CONCURRENCY = 8;
const MAX_RESULTS = 250;
const BINARY_PREFIX = 8192;

type Candidate = { relPath: string; absPath: string };

type RemoteScanOptions = {
  candidates: Candidate[];
  readCandidate: ScanReadCandidate;
  matcher: MatcherWorker;
  signal: AbortSignal;
  onBatch: (batch: { rows: SearchMatch[]; done: boolean }) => void;
};

async function readCandidate(candidate: Candidate, read: ScanReadCandidate): Promise<string | null> {
  try {
    const text = await read(candidate.absPath, candidate.relPath);
    if (text === null || text.slice(0, BINARY_PREFIX).includes('\0')) return null;
    return text;
  } catch {
    return null;
  }
}

export async function scanRemoteCandidates(options: RemoteScanOptions): Promise<void> {
  const { candidates, readCandidate: read, matcher, signal, onBatch } = options;
  let nextToRead = 0;
  let remaining = MAX_RESULTS;

  const worker = async () => {
    while (nextToRead < candidates.length && remaining > 0 && !signal.aborted) {
      const candidate = candidates[nextToRead++];
      if (candidate === undefined) continue;
      const text = await readCandidate(candidate, read);
      if (text === null || signal.aborted) continue;
      const matches = await matcher.rows(candidate.relPath, text);
      const rows = matches.slice(0, remaining);
      remaining -= rows.length;
      if (rows.length > 0) onBatch({ rows, done: false });
    }
  };

  await Promise.all(Array.from({ length: READ_CONCURRENCY }, worker));
}
