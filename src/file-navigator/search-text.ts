import { createMatcherWorker } from '../search/matching-worker.js';
import { filterPaths } from '../search/filter-paths.js';
import { createCandidateReader } from '../search/search-files.js';
import { listProjectFiles } from './search.js';
import type { SearchMatch, SearchRequest } from '../search/types.js';
import { SEARCH_MAX_RESULTS } from '../search/types.js';

const READ_CONCURRENCY = 8;
type CandidateReader = (root: string, relPath: string) => Promise<string | null>;

export async function searchText(
  root: string, request: SearchRequest, candidateReader?: CandidateReader,
): Promise<SearchMatch[]> {
  if (request.query === '') return [];
  const policyReader = await createCandidateReader(root);
  const read: CandidateReader = candidateReader ?? ((_root, relPath) => policyReader(relPath));
  const candidates = filterPaths(await listProjectFiles(root), request.include, request.exclude);
  const matcher = createMatcherWorker(request.query, request, new AbortController().signal);
  const rows: SearchMatch[] = [];
  const reads = new Map<number, Promise<string | null>>();
  let nextToRead = 0;
  let remaining = SEARCH_MAX_RESULTS;

  const scheduleReads = () => {
    while (nextToRead < candidates.length && reads.size < READ_CONCURRENCY) {
      const index = nextToRead++;
      const relPath = candidates[index];
      if (relPath !== undefined) reads.set(index, read(root, relPath));
    }
  };

  scheduleReads();
  try {
    let nextToProcess = 0;
    while (nextToProcess < candidates.length && remaining > 0) {
      const relPath = candidates[nextToProcess];
      const read = reads.get(nextToProcess);
      if (relPath === undefined || read === undefined) break;
      const text = await read;
      reads.delete(nextToProcess++);
      scheduleReads();
      if (text === null) continue;
      const matches = await matcher.rows(relPath, text);
      const found = matches.slice(0, remaining);
      remaining -= found.length;
      rows.push(...found);
    }
    return rows;
  } finally {
    matcher.dispose();
  }
}
