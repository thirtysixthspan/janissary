import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord } from './helpers.js';
import { completeFilePath } from './fs.js';
import { unchanged } from './candidates.js';
import { completeFileGrepArgument } from './file-grep.js';
import { ALL_ENABLED_POLICY, type CompletionPolicy } from './command-policy.js';

const FILE_SUBCOMMANDS = ['glob', 'grep', 'read', 'list', 'ls', 'stat', 'exists', 'head', 'tail'];
const FILE_READ_FLAGS = ['--limit', '--offset'];
const FILE_GLOB_FLAGS = ['--dirs', '--hidden', '--limit', '--path'];
const FILE_PATH_SUBCOMMANDS = new Set(['list', 'ls', 'stat', 'exists']);

// Complete `file glob <pattern> [--path <dir>] [--dirs] [--hidden] [--limit <n>]`: the flags, and
// directory names after `--path`. The pattern and the `--limit` value get no candidates.
function completeGlobArgument(cursor: CompletionCursor, root: string | undefined): CompletionResult {
  const previous = cursor.preceding.at(-1)?.toLowerCase() ?? '';
  if (previous === '--limit') return unchanged(cursor);
  if (previous === '--path') {
    return root === undefined ? unchanged(cursor) : completeFilePath(cursor, root, { directoriesOnly: true });
  }
  if (cursor.token.startsWith('--')) return completeWord(cursor, FILE_GLOB_FLAGS);
  return unchanged(cursor);
}

function completePathArgument(cursor: CompletionCursor, root: string | undefined): CompletionResult {
  return root === undefined ? unchanged(cursor) : completeFilePath(cursor, root);
}

// Complete every `file` subcommand, including `file read <path> [--offset <line>] [--limit <lines>]`.
// Path arguments complete against `root`, the directory they resolve against; an undefined root (a
// remote tab) offers no paths. Subcommands disabled by `policy` are not offered.
export function completeFileReadCommand(
  cursor: CompletionCursor,
  root: string | undefined,
  policy: CompletionPolicy = ALL_ENABLED_POLICY,
): CompletionResult | null {
  const { command, argumentIndex, preceding, token } = cursor;
  if (command !== 'file') return null;
  if (argumentIndex === 1) {
    return completeWord(cursor, FILE_SUBCOMMANDS.filter((word) => policy.allows(`file ${word}`)));
  }
  const subcommand = preceding[1]?.toLowerCase();
  if (subcommand === 'glob') return completeGlobArgument(cursor, root);
  if (subcommand === 'grep') return completeFileGrepArgument(cursor, root);
  if (subcommand === 'read') {
    const previous = preceding.at(-1)?.toLowerCase() ?? '';
    if (FILE_READ_FLAGS.includes(previous)) return unchanged(cursor);
    if (token.startsWith('--')) return completeWord(cursor, FILE_READ_FLAGS);
    return completePathArgument(cursor, root);
  }
  if (subcommand === 'head' || subcommand === 'tail') {
    if (preceding.at(-1) === '-n') return unchanged(cursor);
    return completePathArgument(cursor, root);
  }
  if (FILE_PATH_SUBCOMMANDS.has(subcommand ?? '')) return completePathArgument(cursor, root);
  return unchanged(cursor);
}
