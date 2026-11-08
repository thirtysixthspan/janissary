import path from 'node:path';
import { completeFilePath } from './fs.js';
import { isDir, longestCommonPrefix, replaceToken, splitToken } from './helpers.js';
import type { CompletionCursor, CompletionResult } from './types.js';

export type Candidate = { completion: string; suffix: string; display: string };

export function unchanged(cursor: CompletionCursor): CompletionResult {
  return { newInput: cursor.before + cursor.after, newCursor: cursor.before.length, matches: [] };
}

export function quotedName(value: string): string {
  return /[\s'"]/u.test(value) ? `"${value.replaceAll('"', String.raw`\"`)}"` : value;
}

export function pathCandidates(cursor: CompletionCursor, cwd: string): Candidate[] {
  const result = completeFilePath(cursor, cwd);
  const { dir, prefix } = splitToken(cursor.token, cwd);
  return result.matches.map((name) => {
    const completion = quotedName(prefix + name);
    const directory = isDir(path.join(dir, name));
    return {
      completion,
      suffix: directory ? '/' : ' ',
      display: completion + (directory ? '/' : ''),
    };
  });
}

export function combineCandidates(cursor: CompletionCursor, candidates: Candidate[]): CompletionResult {
  const unique = candidates.filter((candidate, index) =>
    candidates.findIndex((other) => other.display === candidate.display) === index);
  if (unique.length === 0) return unchanged(cursor);
  const matches = unique.map((candidate) => candidate.display);
  const completed = unique.length === 1
    ? unique[0].completion + unique[0].suffix
    : longestCommonPrefix(unique.map((candidate) => candidate.completion));
  return replaceToken(cursor, completed, matches);
}
