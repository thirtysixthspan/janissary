import path from 'node:path';
import { readdirSync } from 'node:fs';
import type { CompletionCursor, CompletionResult } from './types.js';
import { isDir, longestCommonPrefix, splitToken, replaceToken } from './helpers.js';

export function completeFilePath(cursor: CompletionCursor, cwd: string): CompletionResult {
  const { token, before, after } = cursor;
  const unchanged: CompletionResult = { newInput: before + after, newCursor: before.length, matches: [] };
  const { dir, base } = splitToken(token, cwd);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return unchanged;
  }

  const matches = entries
    .filter((entry) => entry.startsWith(base) && (base.startsWith('.') || !entry.startsWith('.')))
    .toSorted((a, b) => a.localeCompare(b));
  if (matches.length === 0) return unchanged;

  let completedName = longestCommonPrefix(matches);
  let suffix = '';
  if (matches.length === 1) {
    completedName = matches[0];
    suffix = isDir(path.join(dir, matches[0])) ? '/' : ' ';
  }

  const typedDirPrefix = token.slice(0, token.length - base.length);
  return replaceToken(cursor, typedDirPrefix + completedName + suffix, matches);
}
