import { statSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import type { CompletionResult } from './types.js';

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
  before: string,
  after: string,
  tokenStart: number,
  newToken: string,
  matches: string[],
): CompletionResult => {
  const newBefore = before.slice(0, tokenStart) + newToken;
  return { newInput: newBefore + after, newCursor: newBefore.length, matches };
};

export const completeWord = (
  partial: string,
  keepPrefix: string,
  candidates: string[],
  suffix: string,
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult => {
  const matches = candidates.filter((c) => c.startsWith(partial)).toSorted((a, b) => a.localeCompare(b));
  if (matches.length === 0) return { newInput: before + after, newCursor: before.length, matches: [] };
  const completed = matches.length === 1 ? matches[0] + suffix : longestCommonPrefix(matches);
  return replaceToken(before, after, tokenStart, keepPrefix + completed, matches);
};
