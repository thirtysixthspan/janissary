import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord } from './helpers.js';
import { unchanged } from './candidates.js';
import { ALL_ENABLED_POLICY, type CompletionPolicy } from './command-policy.js';
import { webSearchProviderNames } from '../web-search/search.js';

const WEB_SUBCOMMANDS = ['search'];
const WEB_FLAGS = ['--results', '--max-chars', '--depth', '--provider'];
const DEPTH_VALUES = ['basic', 'advanced'];

// Complete `web search <query> [--results <n>] [--max-chars <n>] [--depth <mode>] [--provider <name>]`:
// the flags not yet used after the query, and the values of `--depth` and `--provider`. The query and
// the numeric values get no candidates.
function completeSearchArgument(cursor: CompletionCursor): CompletionResult {
  const previous = cursor.preceding.at(-1) ?? '';
  if (previous === '--depth') return completeWord(cursor, DEPTH_VALUES);
  if (previous === '--provider') return completeWord(cursor, ['auto', ...webSearchProviderNames()]);
  if (previous === '--results' || previous === '--max-chars') return unchanged(cursor);
  if (cursor.token.startsWith('-') && cursor.argumentIndex >= 3) {
    const used = new Set(cursor.preceding.slice(2).filter((word) => WEB_FLAGS.includes(word)));
    return completeWord(cursor, WEB_FLAGS.filter((flag) => !used.has(flag)));
  }
  return unchanged(cursor);
}

// Complete the `web` command: its `search` subcommand while `policy` allows it, and then the
// arguments of `web search`. Other `web` subcommands and every query word get no candidates, so no
// `web` line falls through to filesystem completion.
export function completeWebCommand(
  cursor: CompletionCursor,
  policy: CompletionPolicy = ALL_ENABLED_POLICY,
): CompletionResult | null {
  const { command, argumentIndex, preceding } = cursor;
  if (command !== 'web') return null;
  if (!policy.allows('web search')) return unchanged(cursor);
  if (argumentIndex === 1) {
    return completeWord(cursor, WEB_SUBCOMMANDS.filter((word) => policy.allows(`web ${word}`)));
  }
  if (preceding[1]?.toLowerCase() !== 'search') return unchanged(cursor);
  return completeSearchArgument(cursor);
}
