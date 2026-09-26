import { statSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import type { CompletionCursor, CompletionResult } from './types.js';

export const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

export const longestCommonPrefix = (items: string[]): string => {
  if (items.length === 0) return '';
  let prefix = items[0];
  for (const item of items.slice(1)) {
    while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
};

export const splitToken = (token: string, cwd: string): { dir: string; base: string } => {
  const expanded = token.startsWith('~') ? homedir() + token.slice(1) : token;
  const slash = expanded.lastIndexOf('/');
  if (slash !== -1) {
    const dirPart = expanded.slice(0, slash + 1) || '/';
    return { dir: path.resolve(cwd, dirPart), base: expanded.slice(slash + 1) };
  }
  return { dir: cwd, base: expanded };
};

export const replaceToken = (
  cursor: CompletionCursor,
  newToken: string,
  matches: string[],
): CompletionResult => {
  const newBefore = cursor.before.slice(0, cursor.tokenStart) + newToken;
  return { newInput: newBefore + cursor.after, newCursor: newBefore.length, matches };
};

type CompleteWordOptions = { keepPrefix?: string; suffix?: string; partial?: string };

// Completes the cursor's token (or `partial`) against `candidates`. A unique match gets `suffix`
// appended — a space unless overridden — and `keepPrefix` stays ahead of whatever is completed.
export const completeWord = (
  cursor: CompletionCursor,
  candidates: string[],
  { keepPrefix = '', suffix = ' ', partial = cursor.token }: CompleteWordOptions = {},
): CompletionResult => {
  const matches = candidates.filter((c) => c.startsWith(partial)).toSorted((a, b) => a.localeCompare(b));
  if (matches.length === 0) {
    return { newInput: cursor.before + cursor.after, newCursor: cursor.before.length, matches: [] };
  }
  const completed = matches.length === 1 ? matches[0] + suffix : longestCommonPrefix(matches);
  return replaceToken(cursor, keepPrefix + completed, matches);
};
