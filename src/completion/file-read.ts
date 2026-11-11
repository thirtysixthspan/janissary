import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord } from './helpers.js';
import { completeFilePath } from './fs.js';
import { unchanged } from './candidates.js';

const FILE_SUBCOMMANDS = ['read'];
const FILE_READ_FLAGS = ['--limit', '--offset'];

// Complete `file read <path> [--offset <line>] [--limit <lines>]`. Paths complete against `root`,
// the directory the read resolves against; an undefined root (a remote tab) offers no paths.
export function completeFileReadCommand(cursor: CompletionCursor, root: string | undefined): CompletionResult | null {
  const { command, argumentIndex, preceding, token } = cursor;
  if (command !== 'file') return null;
  if (argumentIndex === 1) return completeWord(cursor, FILE_SUBCOMMANDS);
  if (preceding[1]?.toLowerCase() !== 'read') return unchanged(cursor);
  const previous = preceding.at(-1)?.toLowerCase() ?? '';
  if (FILE_READ_FLAGS.includes(previous)) return unchanged(cursor);
  if (token.startsWith('--')) return completeWord(cursor, FILE_READ_FLAGS);
  return root === undefined ? unchanged(cursor) : completeFilePath(cursor, root);
}
