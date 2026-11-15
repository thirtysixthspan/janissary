import type { MatcherModes } from '../search/compile-matcher.js';
import type { MatcherWorker } from '../search/matcher-worker-protocol.js';
import { createMatcherWorker, MatcherDeadlineError } from '../search/matching-worker.js';
import type { SearchMatch } from '../search/types.js';
import type { FileGrepArgs } from './command.js';
import { withDeadline } from './deadline.js';
import type { GrepEnding } from './format.js';
import { createCandidateReader } from './read-candidate.js';

export const GREP_TIMEOUT_MS = 30_000;

export type ScanResult = {
  rows: SearchMatch[];
  ending: GrepEnding | undefined;
};

export function grepMatcherModes(args: FileGrepArgs): MatcherModes {
  return { regex: !args.literal, matchCase: args.caseSensitive, wholeWord: args.word };
}

type MatchOutcome =
  | { kind: 'rows'; rows: SearchMatch[] }
  | { kind: 'timeout' }
  | { kind: 'slow' };

export async function scanFiles(
  root: string,
  relPaths: readonly string[],
  args: FileGrepArgs,
  deadline: number,
): Promise<ScanResult> {
  if (relPaths.length === 0) return { rows: [], ending: undefined };
  const rows: SearchMatch[] = [];
  const cap = args.limit + 1;
  const controller = new AbortController();
  const setup = await withDeadline(deadline, () => createCandidateReader(root, controller.signal));
  if (setup.kind === 'timeout') {
    const stopped: ScanResult = { rows, ending: { kind: 'timeout' } };
    controller.abort();
    return stopped;
  }
  const reader = setup.value;
  let worker: MatcherWorker | undefined;

  const match = async (relPath: string, text: string): Promise<MatchOutcome> => {
    try {
      const result = await withDeadline(deadline, () => {
        const matcher = worker ?? createMatcherWorker(args.pattern, grepMatcherModes(args), controller.signal);
        worker = matcher;
        return matcher.rows(relPath, text);
      });
      return result.kind === 'timeout' ? { kind: 'timeout' } : { kind: 'rows', rows: result.value };
    } catch (error) {
      if (error instanceof MatcherDeadlineError) return { kind: 'slow' };
      throw error;
    }
  };

  try {
    for (const relPath of relPaths) {
      const read = await withDeadline(deadline, () => reader(relPath));
      if (read.kind === 'timeout') {
        const stopped: ScanResult = { rows, ending: { kind: 'timeout' } };
        controller.abort();
        return stopped;
      }
      if (read.value === null) continue;
      const outcome = await match(relPath, read.value);
      if (outcome.kind === 'timeout') {
        const stopped: ScanResult = { rows, ending: { kind: 'timeout' } };
        controller.abort();
        return stopped;
      }
      if (outcome.kind === 'slow') return { rows, ending: { kind: 'slow', path: relPath } };
      rows.push(...outcome.rows.slice(0, cap - rows.length));
      if (rows.length === cap) {
        return { rows: rows.slice(0, args.limit), ending: { kind: 'limit', limit: args.limit } };
      }
    }
    return { rows, ending: undefined };
  } finally {
    worker?.dispose();
  }
}
