import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord } from './helpers.js';

// The label/target-completing handlers, split out of handlers.ts: each completes against a flat
// list of tab labels, agent names, or connection ids, as opposed to the value-list completions
// (monitor personas, syntax themes, harness models) that remain there.

export function completeAgentName(cursor: CompletionCursor, labels: string[]): CompletionResult | null {
  const { command, argumentIndex, token } = cursor;
  if (argumentIndex !== 1 || (command !== 'msg' && command !== 'broadcast')) {
    return null;
  }
  if (command === 'broadcast') {
    const segStart = token.lastIndexOf(',') + 1;
    return completeWord(cursor, [...labels, 'all'], {
      partial: token.slice(segStart),
      keepPrefix: token.slice(0, segStart),
      suffix: '',
    });
  }
  return completeWord(cursor, labels);
}

export function completeSendTarget(cursor: CompletionCursor, labels: string[]): CompletionResult | null {
  if (cursor.argumentIndex !== 1 || !['send', 'queue', 'close', 'exit'].includes(cursor.command)) return null;
  return completeWord(cursor, labels);
}

// Complete the target of a `schedule … in <tab>` clause against open tab labels. The clause
// sits right after the timer name (or `list`/`clear`) at argument 3, or after `cancel <name>`
// at argument 4 — anywhere else the word `in` belongs to the scheduled command itself.
export function completeScheduleTarget(cursor: CompletionCursor, labels: string[]): CompletionResult | null {
  const { command, argumentIndex, preceding } = cursor;
  if (command !== 'schedule' || preceding.at(-1)?.toLowerCase() !== 'in') return null;
  const isClause = argumentIndex === 3 || (argumentIndex === 4 && preceding[1]?.toLowerCase() === 'cancel');
  if (!isClause) return null;
  return completeWord(cursor, labels);
}

export function completeConnectionClose(cursor: CompletionCursor, connections: string[]): CompletionResult | null {
  const { command, argumentIndex, preceding } = cursor;
  if (argumentIndex !== 2 || command !== 'connection' || preceding[1]?.toLowerCase() !== 'close') {
    return null;
  }
  return completeWord(cursor, connections);
}
