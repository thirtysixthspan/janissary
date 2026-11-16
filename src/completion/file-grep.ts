import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord } from './helpers.js';
import { completeFilePath } from './fs.js';
import { unchanged } from './candidates.js';

const FILE_GREP_FLAGS = [
  '--literal', '--word', '--case-sensitive', '--path', '--include', '--exclude', '--limit',
];
const FILE_GREP_SWITCHES = new Set(['--literal', '--word', '--case-sensitive']);
const FILE_GREP_VALUE_FLAGS = new Set(['--path', '--include', '--exclude', '--limit']);

type GrepArgumentState = 'flags' | 'path-value' | 'other-value' | 'pattern';

// Classifies the committed tokens after `file grep` without validating them: a lowercase valued
// flag consumes exactly one following token, a switch consumes none, and anything else — a
// pattern, a terminator, an unknown flag or an uppercased one — starts the pattern for good.
function grepArgumentState(preceding: readonly string[]): GrepArgumentState {
  let pendingValue: string | undefined;
  for (const token of preceding.slice(2)) {
    if (pendingValue !== undefined) {
      pendingValue = undefined;
      continue;
    }
    if (FILE_GREP_SWITCHES.has(token)) continue;
    if (FILE_GREP_VALUE_FLAGS.has(token)) {
      pendingValue = token;
      continue;
    }
    return 'pattern';
  }
  if (pendingValue === undefined) return 'flags';
  return pendingValue === '--path' ? 'path-value' : 'other-value';
}

// Complete `file grep` flags and `--path` values: flags and path values come before the pattern and
// nothing is offered once it starts. Paths complete against `root`; an undefined root (a remote
// tab) offers no paths. The include, exclude and limit values get no candidates, and a current
// `--` still in flag position offers every flag.
export function completeFileGrepArgument(cursor: CompletionCursor, root: string | undefined): CompletionResult {
  const state = grepArgumentState(cursor.preceding);
  if (state === 'pattern' || state === 'other-value') return unchanged(cursor);
  if (state === 'path-value') return root === undefined ? unchanged(cursor) : completeFilePath(cursor, root);
  if (cursor.token.startsWith('--')) return completeWord(cursor, FILE_GREP_FLAGS);
  return unchanged(cursor);
}
