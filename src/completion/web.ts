import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord } from './helpers.js';
import { unchanged } from './candidates.js';
import { ALL_ENABLED_POLICY, type CompletionPolicy } from './command-policy.js';
import { webSearchProviderNames } from '../web/search/search.js';
import { webFetchProviderNames } from '../web/fetch/fetch.js';

const WEB_SUBCOMMANDS = ['search', 'fetch'];
const SEARCH_FLAGS = ['--results', '--max-chars', '--depth', '--provider'];
const FETCH_FLAGS = ['--format', '--timeout', '--max-chars', '--offset', '--provider'];
const DEPTH_VALUES = ['basic', 'advanced'];
const FORMAT_VALUES = ['markdown', 'text', 'html'];

function completeUnusedFlag(cursor: CompletionCursor, flags: string[]): CompletionResult {
  if (cursor.token.startsWith('-') && cursor.argumentIndex >= 3) {
    const used = new Set(cursor.preceding.slice(2).filter((word) => flags.includes(word)));
    return completeWord(cursor, flags.filter((flag) => !used.has(flag)));
  }
  return unchanged(cursor);
}

// Complete `web search <query> [--results <n>] [--max-chars <n>] [--depth <mode>] [--provider <name>]`:
// the flags not yet used after the query, and the values of `--depth` and `--provider`. The query and
// the numeric values get no candidates.
function completeSearchArgument(cursor: CompletionCursor): CompletionResult {
  const previous = cursor.preceding.at(-1) ?? '';
  if (previous === '--depth') return completeWord(cursor, DEPTH_VALUES);
  if (previous === '--provider') return completeWord(cursor, ['auto', ...webSearchProviderNames()]);
  if (previous === '--results' || previous === '--max-chars') return unchanged(cursor);
  return completeUnusedFlag(cursor, SEARCH_FLAGS);
}

// Complete `web fetch <url> [--format <f>] [--timeout <n>] [--max-chars <n>] [--offset <n>] [--provider <name>]`:
// the flags not yet used after the URL, and the values of `--format` and `--provider`. The URL and
// the numeric values get no candidates.
function completeFetchArgument(cursor: CompletionCursor): CompletionResult {
  const previous = cursor.preceding.at(-1) ?? '';
  if (previous === '--format') return completeWord(cursor, FORMAT_VALUES);
  if (previous === '--provider') return completeWord(cursor, ['auto', ...webFetchProviderNames()]);
  if (['--timeout', '--max-chars', '--offset'].includes(previous)) return unchanged(cursor);
  return completeUnusedFlag(cursor, FETCH_FLAGS);
}

// Complete the `web` command: its `search` and `fetch` subcommands while `policy` allows each, and
// then the arguments of whichever subcommand the policy allows. A disabled subcommand's arguments
// and every word without a candidate get nothing, so no `web` line falls through to filesystem
// completion.
export function completeWebCommand(
  cursor: CompletionCursor,
  policy: CompletionPolicy = ALL_ENABLED_POLICY,
): CompletionResult | null {
  const { command, argumentIndex, preceding } = cursor;
  if (command !== 'web') return null;
  if (argumentIndex === 1) {
    return completeWord(cursor, WEB_SUBCOMMANDS.filter((word) => policy.allows(`web ${word}`)));
  }
  const subcommand = preceding[1]?.toLowerCase();
  if (subcommand === 'search') {
    return policy.allows('web search') ? completeSearchArgument(cursor) : unchanged(cursor);
  }
  if (subcommand === 'fetch') {
    return policy.allows('web fetch') ? completeFetchArgument(cursor) : unchanged(cursor);
  }
  return unchanged(cursor);
}
