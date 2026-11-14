import path from 'node:path';
import { readdirSync } from 'node:fs';
import type { CompletionCursor, CompletionResult } from './types.js';
import { isDir, longestCommonPrefix, splitToken, replaceToken } from './helpers.js';

type CompleteFilePathOptions = { directoriesOnly?: boolean };

export function completeFilePath(
  cursor: CompletionCursor,
  cwd: string,
  { directoriesOnly = false }: CompleteFilePathOptions = {},
): CompletionResult {
  const { token, before, after } = cursor;
  const unchanged: CompletionResult = { newInput: before + after, newCursor: before.length, matches: [] };
  const { dir, base, prefix } = splitToken(token, cwd);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return unchanged;
  }

  const matches = entries
    .filter((entry) => entry.startsWith(base) && (base.startsWith('.') || !entry.startsWith('.')))
    .filter((entry) => !directoriesOnly || isDir(path.join(dir, entry)))
    .toSorted((a, b) => a.localeCompare(b));
  if (matches.length === 0) return unchanged;

  let completedName = longestCommonPrefix(matches);
  let suffix = '';
  if (matches.length === 1) {
    completedName = matches[0];
    suffix = isDir(path.join(dir, matches[0])) ? '/' : ' ';
  }

  return replaceToken(cursor, prefix + completedName + suffix, matches);
}
