import type { CompletionResult } from '../types.js';
import { completeWord } from './helpers.js';

// The label/target-completing handlers, split out of handlers.ts: each completes against a flat
// list of tab labels, agent names, or connection ids, as opposed to the value-list completions
// (monitor personas, syntax themes, harness models) that remain there.

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

export function completeSendTarget(
  command: string,
  argumentIndex: number,
  token: string,
  labels: string[],
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (argumentIndex !== 1 || !['send', 'queue', 'close', 'exit'].includes(command)) return null;
  return completeWord(token, '', labels, ' ', before, after, tokenStart);
}

// Complete the target of a `schedule … in <tab>` clause against open tab labels. The clause
// sits right after the timer name (or `list`/`clear`) at argument 3, or after `cancel <name>`
// at argument 4 — anywhere else the word `in` belongs to the scheduled command itself.
export function completeScheduleTarget(
  command: string,
  argumentIndex: number,
  preceding: string[],
  token: string,
  labels: string[],
  before: string,
  after: string,
  tokenStart: number,
): CompletionResult | null {
  if (command !== 'schedule' || preceding.at(-1)?.toLowerCase() !== 'in') return null;
  const isClause = argumentIndex === 3 || (argumentIndex === 4 && preceding[1]?.toLowerCase() === 'cancel');
  if (!isClause) return null;
  return completeWord(token, '', labels, ' ', before, after, tokenStart);
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
