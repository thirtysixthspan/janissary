import type { CompletionResult } from './types.js';
import { completeWord } from './completion-helpers.js';
import { BROWSER_SUBCOMMANDS } from './browser-command.js';

export function completeAgentName(
  command: string,
  argumentIndex: number,
  token: string,
  agents: string[],
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (argumentIndex !== 1 || (command !== 'msg' && command !== 'broadcast')) {
    return null;
  }
  if (command === 'broadcast') {
    const segStart = token.lastIndexOf(',') + 1;
    return completeWord(token.slice(segStart), token.slice(0, segStart), [...agents, 'all'], '', before, after, tokenStart);
  }
  return completeWord(token, '', agents, ' ', before, after, tokenStart);
}

export function completeConnectionClose(
  command: string,
  argumentIndex: number,
  preceding: string[],
  token: string,
  connections: string[],
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (argumentIndex !== 2 || command !== 'connection' || preceding[1]?.toLowerCase() !== 'close') {
    return null;
  }
  return completeWord(token, '', connections, ' ', before, after, tokenStart);
}

export function completeBrowserCommand(
  command: string,
  argumentIndex: number,
  preceding: string[],
  token: string,
  connections: string[],
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (command !== 'browser') {
    return null;
  }
  if (argumentIndex === 1) {
    return completeWord(token, '', BROWSER_SUBCOMMANDS, ' ', before, after, tokenStart);
  }
  const sub = preceding[1]?.toLowerCase();
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
  return null;
}
