import type { CompletionCursor } from './types.js';

export function readCompletionCursor(input: string, cursor: number): CompletionCursor {
  const before = input.slice(0, cursor);
  const after = input.slice(cursor);
  const tokenStart = Math.max(before.lastIndexOf(' '), before.lastIndexOf('\t')) + 1;
  const token = before.slice(tokenStart);
  const preceding = before.slice(0, tokenStart).trim().split(/\s+/).filter(Boolean);
  const command = (preceding.at(0) ?? '').replace(/^\//, '').toLowerCase();
  return { before, after, tokenStart, token, preceding, command, argumentIndex: preceding.length };
}
