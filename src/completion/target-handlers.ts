import type { CompletionCursor, CompletionResult } from './types.js';
import { completeWord, longestCommonPrefix, replaceToken } from './helpers.js';
import { readToken, skipSpaces } from '../command/quoted-token.js';
import { TAB_SUBCOMMANDS } from '../commands/parse-tab.js';

// The label/target-completing handlers, split out of handlers.ts: each completes against a flat
// list of tab labels, agent names, or connection ids, as opposed to the value-list completions
// (monitor personas, syntax themes, harness models) that remain there.

export function completeSendTarget(cursor: CompletionCursor, labels: string[]): CompletionResult | null {
  if (cursor.argumentIndex !== 1 || !['send', 'queue', 'close', 'exit'].includes(cursor.command)) return null;
  return completeWord(cursor, labels);
}

function precedingWords(cursor: CompletionCursor): string[] | undefined {
  const input = cursor.before.slice(0, cursor.tokenStart);
  const words: string[] = [];
  let index = 0;
  while (index < input.length) {
    index = skipSpaces(input, index);
    if (index === input.length) break;
    const token = readToken(input, index);
    if (!token) return undefined;
    words.push(token.value);
    index = token.end;
  }
  return words;
}

function unchanged(cursor: CompletionCursor): CompletionResult {
  return { newInput: cursor.before + cursor.after, newCursor: cursor.before.length, matches: [] };
}

function formatTarget(label: string): string {
  return /[\s"']/u.test(label) ? `"${label.replaceAll('"', String.raw`\"`)}"` : label;
}

function completeTabTarget(cursor: CompletionCursor, labels: string[]): CompletionResult {
  let partial = cursor.token;
  if (partial.startsWith('"') || partial.startsWith("'")) {
    const parsed = readToken(partial, 0);
    partial = parsed?.value ?? partial.slice(1);
  }
  const matches = labels.filter((label) => label.startsWith(partial)).toSorted((a, b) => a.localeCompare(b));
  const suggestions = matches.map((label) => formatTarget(label));
  if (suggestions.length === 0) return unchanged(cursor);
  if (matches.length === 1) return replaceToken(cursor, `${suggestions[0]} `, suggestions);
  const common = longestCommonPrefix(matches);
  return /\s/u.test(common) ? unchanged(cursor) : replaceToken(cursor, common, suggestions);
}

export function completeTabCommand(cursor: CompletionCursor, labels: string[]): CompletionResult | null {
  if (cursor.command !== 'tab') return null;
  const preceding = precedingWords(cursor);
  if (!preceding) return unchanged(cursor);
  if (preceding.length === 1 && preceding[0]?.toLowerCase() === 'tab') {
    return completeWord(cursor, [...TAB_SUBCOMMANDS]);
  }
  const subcommand = preceding[1]?.toLowerCase();
  if (!TAB_SUBCOMMANDS.includes(subcommand as (typeof TAB_SUBCOMMANDS)[number])) return null;
  if (preceding.length === 2) return completeTabTarget(cursor, labels);
  if (preceding.length === 3 && ['pane', 'dock'].includes(subcommand)) {
    return completeWord(cursor, ['left', 'right']);
  }
  return null;
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
