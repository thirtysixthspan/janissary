import { createCandidateReader as createPolicyReader } from '../search/search-files.js';

export type CandidateReader = (relPath: string) => Promise<string | null>;

export async function createCandidateReader(root: string, signal?: AbortSignal): Promise<CandidateReader> {
  return createPolicyReader(root, signal);
}
