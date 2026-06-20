import { readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';

export type CompletionResult = {
  newInput: string;
  newCursor: number;
  matches: string[];
};

const isDir = (p: string): boolean => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

const longestCommonPrefix = (items: string[]): string => {
  if (items.length === 0) return '';
  let prefix = items[0];
  for (const item of items.slice(1)) {
    while (!item.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix;
};

// Split the path token into the directory to scan and the partial basename to match.
const splitToken = (token: string, cwd: string): { dir: string; base: string } => {
  const expanded = token.startsWith('~') ? homedir() + token.slice(1) : token;
  const slash = expanded.lastIndexOf('/');
  if (slash >= 0) {
    const dirPart = expanded.slice(0, slash + 1) || '/';
    return { dir: resolve(cwd, dirPart), base: expanded.slice(slash + 1) };
  }
  return { dir: cwd, base: expanded };
};

/**
 * Tab-complete the path token ending at the cursor against the filesystem,
 * resolving relative paths against `cwd`.
 *
 * - A single match is filled in fully (trailing `/` for directories, space for files).
 * - Multiple matches fill in their longest common prefix; `matches` lists them all so
 *   the caller can display the options when no further completion is possible.
 */
export function completeCommandLine(input: string, cursor: number, cwd: string): CompletionResult {
  const before = input.slice(0, cursor);
  const after = input.slice(cursor);
  const tokenStart = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\t')) + 1;
  const token = before.slice(tokenStart);

  const { dir, base } = splitToken(token, cwd);

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return { newInput: input, newCursor: cursor, matches: [] };
  }

  // Hide dotfiles unless the partial name explicitly starts with a dot (bash-like).
  const matches = entries
    .filter((e) => e.startsWith(base) && (base.startsWith('.') || !e.startsWith('.')))
    .sort();
  if (matches.length === 0) return { newInput: input, newCursor: cursor, matches: [] };

  let completedName = longestCommonPrefix(matches);
  let suffix = '';
  if (matches.length === 1) {
    completedName = matches[0];
    suffix = isDir(join(dir, matches[0])) ? '/' : ' ';
  }

  const typedDirPrefix = token.slice(0, token.length - base.length);
  const newToken = typedDirPrefix + completedName + suffix;
  const newBefore = before.slice(0, tokenStart) + newToken;
  return { newInput: newBefore + after, newCursor: newBefore.length, matches };
}
