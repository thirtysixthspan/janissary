import path from 'node:path';
import { readdirSync } from 'node:fs';
import { BROWSER_SUBCOMMANDS } from './browser-command.js';
import type { CompletionResult } from './types.js';
import { isDir, longestCommonPrefix, splitToken, replaceToken, completeWord } from './completion-helpers.js';

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

  // Agent-name completion for the recipient argument.
  if (argumentIndex === 1 && (command === 'msg' || command === 'broadcast')) {
    if (command === 'broadcast') {
      const segStart = token.lastIndexOf(',') + 1; // complete the segment after the last comma
      return completeWord(token.slice(segStart), token.slice(0, segStart), [...agents, 'all'], '', before, after, tokenStart);
    }
    return completeWord(token, '', agents, ' ', before, after, tokenStart);
  }

  // Connection-string completion for `connection close <kind>:<id>`.
  if (argumentIndex === 2 && command === 'connection' && preceding[1]?.toLowerCase() === 'close') {
    return completeWord(token, '', connections, ' ', before, after, tokenStart);
  }

  // `browser` command completion: subcommands, then window ids where one is expected.
  if (command === 'browser') {
    if (argumentIndex === 1) {
      return completeWord(token, '', BROWSER_SUBCOMMANDS, ' ', before, after, tokenStart);
    }
    const sub = preceding[1]?.toLowerCase();
    // Window ids are derived from the active tab's `browser:<id>` connection strings.
    const windowIds = connections
      .filter((c) => c.startsWith('browser:'))
      .map((c) => c.slice('browser:'.length));
    if (argumentIndex === 2 && sub === 'use') {
      return completeWord(token, '', windowIds, ' ', before, after, tokenStart);
    }
    if (argumentIndex === 2 && sub === 'window') {
      return completeWord(token, '', ['close'], ' ', before, after, tokenStart);
    }
    if (argumentIndex === 3 && sub === 'window' && preceding[2]?.toLowerCase() === 'close') {
      return completeWord(token, '', windowIds, ' ', before, after, tokenStart);
    }
    // Other positions (goto url, eval js, open name) fall through to path completion.
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
