import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createMatcherWorker } from '../search/matching-worker.js';
import { filterPaths } from '../search/filter-paths.js';
import { listProjectFiles } from './search.js';
import type { SearchMatch, SearchRequest } from '../search/types.js';
import {
  SEARCH_BINARY_PREFIX_BYTES, SEARCH_MAX_FILE_BYTES, SEARCH_MAX_RESULTS,
} from '../search/types.js';

const READ_CONCURRENCY = 8;

async function readCandidate(root: string, relPath: string): Promise<string | null> {
  const absPath = path.join(root, relPath);
  try {
    const info = await stat(absPath);
    if (info.size > SEARCH_MAX_FILE_BYTES) return null;
    const text = await readFile(absPath, 'utf8');
    return text.slice(0, SEARCH_BINARY_PREFIX_BYTES).includes('\0') ? null : text;
  } catch {
    return null;
  }
}

export async function searchText(root: string, request: SearchRequest): Promise<SearchMatch[]> {
  if (request.query === '') return [];
  const candidates = filterPaths(await listProjectFiles(root), request.include, request.exclude);
  const matcher = createMatcherWorker(request.query, request, new AbortController().signal);
  const rows: SearchMatch[] = [];
  let next = 0;
  let remaining = SEARCH_MAX_RESULTS;

  const worker = async () => {
    while (next < candidates.length && remaining > 0) {
      const relPath = candidates[next++];
      if (relPath === undefined) continue;
      const text = await readCandidate(root, relPath);
      if (text === null) continue;
      const matches = await matcher.rows(relPath, text);
      const found = matches.slice(0, remaining);
      remaining -= found.length;
      rows.push(...found);
    }
  };

  try {
    await Promise.all(Array.from({ length: READ_CONCURRENCY }, worker));
    return rows;
  } finally {
    matcher.dispose();
  }
}
