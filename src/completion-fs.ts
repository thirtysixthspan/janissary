import path from 'node:path';
import { readdirSync } from 'node:fs';
import type { CompletionResult } from './types.js';
import { isDir, longestCommonPrefix, splitToken, replaceToken } from './completion-helpers.js';

export function completeFilePath(
  token: string,
  cwd: string,
  before: string,
  after: string,
  tokenStart: number,
  input: string,
  cursor: number,
): CompletionResult {
  const { dir, base } = splitToken(token, cwd);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return { newInput: input, newCursor: cursor, matches: [] };
  }

  const matches = entries
    .filter((entry) => entry.startsWith(base) && (base.startsWith('.') || !entry.startsWith('.')))
    .toSorted((a, b) => a.localeCompare(b));
  if (matches.length === 0) return { newInput: input, newCursor: cursor, matches: [] };

  let completedName = longestCommonPrefix(matches);
  let suffix = '';
  if (matches.length === 1) {
    completedName = matches[0];
    suffix = isDir(path.join(dir, matches[0])) ? '/' : ' ';
  }

  const typedDirPrefix = token.slice(0, token.length - base.length);
  return replaceToken(before, after, tokenStart, typedDirPrefix + completedName + suffix, matches);
}
