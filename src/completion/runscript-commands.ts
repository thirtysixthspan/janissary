import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord } from './helpers.js';
import { completeFilePath } from './fs.js';

export function completeRunscriptCommand(
  cursor: CompletionCursor,
  cwd: string,
  scripts: string[],
): CompletionResult | null {
  if (cursor.argumentIndex !== 1 || !['execute', 'edit'].includes(cursor.command)) return null;
  if (cursor.command === 'edit' && ['/', '\\', '.', ':'].some((character) => cursor.token.includes(character))) return null;
  const candidates = cursor.command === 'edit'
    ? [...new Set([...scripts, ...completeFilePath(cursor, cwd).matches])]
    : scripts;
  return completeWord(cursor, candidates);
}
