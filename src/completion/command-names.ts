import { combineCandidates, pathCandidates, type Candidate } from './candidates.js';
import type { CompletionPolicy } from './command-policy.js';
import type { CompletionCursor, CompletionResult } from './types.js';

function declined(token: string): boolean {
  return token === '' || token.startsWith('!') || /[/\\'"]/u.test(token);
}

function nameCandidates(token: string, policy: CompletionPolicy): Candidate[] {
  return policy.names
    .filter((name) => name.startsWith(token))
    .map((name) => ({ completion: name, suffix: ' ', display: name }));
}

export function completeApplicationCommandName(
  cursor: CompletionCursor,
  policy: CompletionPolicy,
  cwd: string,
): CompletionResult | null {
  if (cursor.argumentIndex !== 0 || declined(cursor.token)) return null;
  return combineCandidates(cursor, [
    ...nameCandidates(cursor.token, policy),
    ...pathCandidates(cursor, cwd),
  ]);
}
