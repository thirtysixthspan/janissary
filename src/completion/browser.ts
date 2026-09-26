import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord } from './helpers.js';
import { BROWSER_SUBCOMMANDS } from '../browser/command.js';

export function completeBrowserCommand(cursor: CompletionCursor, connections: string[]): CompletionResult | null {
  const { command, argumentIndex, preceding } = cursor;
  if (command !== 'browser') {
    return null;
  }
  if (argumentIndex === 1) {
    return completeWord(cursor, BROWSER_SUBCOMMANDS);
  }
  const sub = preceding[1]?.toLowerCase();
  const windowIds = connections
    .filter((c) => c.startsWith('browser:'))
    .map((c) => c.slice('browser:'.length));
  if (argumentIndex === 2 && sub === 'use') {
    return completeWord(cursor, windowIds);
  }
  if (argumentIndex === 2 && sub === 'window') {
    return completeWord(cursor, ['close']);
  }
  if (argumentIndex === 3 && sub === 'window' && preceding[2]?.toLowerCase() === 'close') {
    return completeWord(cursor, windowIds);
  }
  return null;
}
