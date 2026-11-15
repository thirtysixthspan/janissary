import path from 'node:path';
import { listProjectFiles } from '../file-navigator/search.js';
import { filterGrepPaths } from './filter-worker.js';
import type { GrepSearchTarget } from './path-target.js';

function dedupe(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const relPath of paths) {
    if (seen.has(relPath)) continue;
    seen.add(relPath);
    unique.push(relPath);
  }
  return unique;
}

function selectCandidates(target: GrepSearchTarget, listing: readonly string[]): string[] {
  if (target.kind === 'directory') return [...listing];
  const name = path.basename(target.filePath);
  return listing.filter((relPath) => relPath === name);
}

function listingDirectory(target: GrepSearchTarget): string {
  return target.kind === 'directory' ? target.searchDir : path.dirname(target.filePath);
}

function prefixPaths(prefix: string, relPaths: readonly string[]): string[] {
  if (prefix === '') return [...relPaths];
  return relPaths.map((relPath) => `${prefix}/${relPath}`);
}

export async function discoverGrepCandidates(
  target: GrepSearchTarget, include: string, exclude: string, signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted();
  const listed = await listProjectFiles(listingDirectory(target));
  signal.throwIfAborted();
  const selected = selectCandidates(target, dedupe(listed));
  signal.throwIfAborted();
  const filtered = await filterGrepPaths(selected, include, exclude, signal);
  signal.throwIfAborted();
  return prefixPaths(target.prefix, filtered);
}
