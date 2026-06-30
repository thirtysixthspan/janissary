import path from 'node:path';
import { readdirSync } from 'node:fs';
import type { CompletionResult } from './types.js';
import { isDir, longestCommonPrefix, splitToken, replaceToken } from './completion-helpers.js';
import { completeAgentName, completeConnectionClose, completeBrowserCommand } from './completion-handlers.js';

/**
 * Tab-complete the token ending at the cursor.
 *
 * - For the recipient argument of `msg`/`broadcast`, completes against active agent names
 *   (`broadcast` also offers `all` and supports a comma-separated list).
 * - For the target of `connection close`, completes against open connection strings
 *   (e.g. `sqlite:movies`, `shell:bash`, `acp:opencode`, `browser:w1`).
 * - For the `browser` command, completes subcommands and, where a window id is expected
 *   (`browser use`, `browser window close`), the current tab's open window ids.
 * - Otherwise completes a filesystem path relative to `cwd`.
 *
 * A single match is filled in fully; multiple matches fill in their longest common prefix
 * and are returned via `matches` so the caller can display the options.
 */
export function completeCommandLine(
  input: string,
  cursor: number,
  cwd: string,
  agents: string[] = [],
  connections: string[] = [],
): CompletionResult {
  const before = input.slice(0, cursor);
  const after = input.slice(cursor);
  const tokenStart = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\t')) + 1;
  const token = before.slice(tokenStart);

  // Determine the command word and which argument position the cursor is in.
  const preceding = before.slice(0, tokenStart).trim().split(/\s+/).filter(Boolean);
  const command = preceding[0]?.replace(/^\//, '').toLowerCase();
  const argumentIndex = preceding.length;

  // Try command-specific handlers.
  const result = completeAgentName(command, argumentIndex, token, agents, before, after, tokenStart) ??
    completeConnectionClose(command, argumentIndex, preceding, token, connections, before, after, tokenStart) ??
    completeBrowserCommand(command, argumentIndex, preceding, token, connections, before, after, tokenStart);
  if (result !== null) {
    return result;
  }

  // Filesystem path completion.
  const { dir, base } = splitToken(token, cwd);
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return { newInput: input, newCursor: cursor, matches: [] };
  }

  // Hide dotfiles unless the partial name explicitly starts with a dot (bash-like).
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
