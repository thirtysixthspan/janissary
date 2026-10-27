import path from 'node:path';
import { isFullyQuoted, readToken, skipSpaces } from '../command/quoted-token.js';
import { VIEW_KEYWORDS } from '../file-navigator/view-args.js';
import { completeFilePath } from './fs.js';
import { completeWord, isDir, longestCommonPrefix, replaceToken, splitToken } from './helpers.js';
import type { CompletionCursor, CompletionResult } from './types.js';

export type FilesCompletions = {
  labels: string[];
  navigators: string[];
  workingDirOf: (label: string) => string | undefined;
};

const EMPTY_FILES_COMPLETIONS: FilesCompletions = {
  labels: [],
  navigators: [],
  workingDirOf: () => { return; },
};

type Word = { value: string; raw: string; bare: boolean };
type Slot =
  | { kind: 'keywords'; print: boolean; bareSide: boolean; label?: string; clauses: ClauseState }
  | { kind: 'values'; values: string[]; quote: boolean }
  | { kind: 'viewPath'; label?: string }
  | { kind: 'trailingPath' }
  | { kind: 'none' };
type Candidate = { completion: string; suffix: string; display: string };

function unchanged(cursor: CompletionCursor): CompletionResult {
  return { newInput: cursor.before + cursor.after, newCursor: cursor.before.length, matches: [] };
}

function words(input: string): Word[] | undefined {
  const result: Word[] = [];
  let index = skipSpaces(input, 0);
  while (index < input.length) {
    const token = readToken(input, index);
    if (!token) return undefined;
    const raw = input.slice(token.start, token.end);
    result.push({ value: token.value, raw, bare: raw === token.value });
    index = skipSpaces(input, token.end);
  }
  return result;
}

function wordIs(word: Word | undefined, value: string): boolean {
  return word?.bare === true && word.value.toLowerCase() === value;
}

type ClauseState = { inLabel?: string; inSeen: boolean; onSeen: boolean; withSeen: boolean; bareSideUsed: boolean };
type ClauseRead = { kind: 'next'; index: number } | { kind: 'slot'; slot: Slot } | { kind: 'stop' };

function readIn(args: Word[], index: number, state: ClauseState, context: FilesCompletions): ClauseRead {
  state.inSeen = true;
  if (index + 1 === args.length) return { kind: 'slot', slot: { kind: 'values', values: context.labels, quote: true } };
  const label = args[index + 1];
  state.inLabel = label && isFullyQuoted(label.raw) ? label.value : label?.raw;
  return { kind: 'next', index: index + 2 };
}

function readOn(args: Word[], index: number, state: ClauseState): ClauseRead {
  if (index + 1 === args.length) {
    return { kind: 'slot', slot: { kind: 'values', values: ['left', 'right'], quote: false } };
  }
  if (!/^(left|right)\b/i.test(args[index + 1]?.raw ?? '')) return { kind: 'stop' };
  state.onSeen = true;
  return { kind: 'next', index: index + 2 };
}

function readWith(args: Word[], index: number, state: ClauseState): ClauseRead {
  const values = ['name', 'size', 'modified', 'permissions'];
  if (index + 1 === args.length) return { kind: 'slot', slot: { kind: 'values', values, quote: false } };
  if (!/^(name|size|modified|permissions)\b/i.test(args[index + 1]?.raw ?? '')) return { kind: 'stop' };
  state.withSeen = true;
  return { kind: 'next', index: index + 2 };
}

function readView(args: Word[], index: number, state: ClauseState): ClauseRead {
  if (index + 1 === args.length) return { kind: 'slot', slot: { kind: 'viewPath', label: state.inLabel } };
  return { kind: 'next', index: index + 2 };
}

function readClause(args: Word[], index: number, state: ClauseState, context: FilesCompletions): ClauseRead {
  const word = args[index];
  if (index === 0 && wordIs(word, 'print')) {
    return index + 1 === args.length
      ? { kind: 'slot', slot: { kind: 'values', values: context.navigators, quote: true } }
      : { kind: 'slot', slot: { kind: 'none' } };
  }
  if (wordIs(word, 'in') && !state.inSeen) return readIn(args, index, state, context);
  if (wordIs(word, 'on') && !state.onSeen) return readOn(args, index, state);
  if (wordIs(word, 'with') && !state.withSeen) return readWith(args, index, state);
  if ((wordIs(word, 'left') || wordIs(word, 'right')) && !state.inSeen && !state.onSeen && !state.bareSideUsed) {
    state.bareSideUsed = true;
    return { kind: 'next', index: index + 1 };
  }
  if (word?.bare && VIEW_KEYWORDS.includes(word.value.toLowerCase() as (typeof VIEW_KEYWORDS)[number])) {
    return readView(args, index, state);
  }
  return { kind: 'stop' };
}

function completionSlot(wordsBeforeToken: Word[], context: FilesCompletions): Slot {
  const args = wordsBeforeToken.slice(1);
  const state: ClauseState = { inSeen: false, onSeen: false, withSeen: false, bareSideUsed: false };
  let index = 0;
  while (index < args.length) {
    const result = readClause(args, index, state, context);
    if (result.kind === 'slot') return result.slot;
    if (result.kind === 'stop') return { kind: 'trailingPath' };
    index = result.index;
  }
  return {
    kind: 'keywords',
    print: args.length === 0,
    bareSide: !state.inSeen && !state.onSeen && !state.bareSideUsed,
    label: state.inLabel,
    clauses: state,
  };
}

function quotedName(value: string): string {
  return /[\s'"]/u.test(value) ? `"${value.replaceAll('"', String.raw`\"`)}"` : value;
}

function valueCandidates(cursor: CompletionCursor, values: string[], quote: boolean): Candidate[] {
  return values
    .toSorted((left, right) => left.localeCompare(right))
    .filter((value) => value.startsWith(cursor.token))
    .map((value) => {
      const completion = quote ? quotedName(value) : value;
      return { completion, suffix: ' ', display: completion };
    });
}

function keywordCandidates(
  cursor: CompletionCursor,
  slot: Extract<Slot, { kind: 'keywords' }>,
  clauses: ClauseState,
): Candidate[] {
  const options = [
    ...(clauses.inSeen ? [] : ['in']),
    ...(clauses.onSeen ? [] : ['on']),
    ...(clauses.withSeen ? [] : ['with']),
    ...VIEW_KEYWORDS,
  ];
  if (slot.print) options.push('print');
  if (slot.bareSide) options.push('left', 'right');
  return options
    .filter((word) => word.startsWith(cursor.token))
    .map((completion) => ({ completion, suffix: ' ', display: completion }));
}

function pathCandidates(cursor: CompletionCursor, cwd: string): Candidate[] {
  const result = completeFilePath(cursor, cwd);
  const { dir, prefix } = splitToken(cursor.token, cwd);
  return result.matches.map((name) => {
    const completion = prefix + quotedName(name);
    const directory = isDir(path.join(dir, name));
    return {
      completion,
      suffix: directory ? '/' : ' ',
      display: completion + (directory ? '/' : ''),
    };
  });
}

function combineCandidates(cursor: CompletionCursor, candidates: Candidate[]): CompletionResult {
  const unique = candidates.filter((candidate, index) =>
    candidates.findIndex((other) => other.display === candidate.display) === index);
  if (unique.length === 0) return unchanged(cursor);
  const matches = unique.map((candidate) => candidate.display);
  const completed = unique.length === 1
    ? unique[0].completion + unique[0].suffix
    : longestCommonPrefix(unique.map((candidate) => candidate.completion));
  return replaceToken(cursor, completed, matches);
}

export function completeFilesCommand(
  cursor: CompletionCursor,
  context: FilesCompletions | undefined,
  cwd: string,
): CompletionResult | null {
  if (cursor.command !== 'files') return null;
  const prefixWords = words(cursor.before.slice(0, cursor.tokenStart));
  if (!prefixWords || !words(cursor.before)) return unchanged(cursor);
  const slot = completionSlot(prefixWords, context ?? EMPTY_FILES_COMPLETIONS);
  if (slot.kind === 'none' || slot.kind === 'trailingPath') return null;
  if (slot.kind === 'values') {
    if (!slot.quote) return completeWord(cursor, slot.values);
    return combineCandidates(cursor, valueCandidates(cursor, slot.values, true));
  }
  if (slot.kind === 'viewPath') {
    const base = slot.label === undefined ? cwd : (context ?? EMPTY_FILES_COMPLETIONS).workingDirOf(slot.label);
    return base === undefined ? unchanged(cursor) : combineCandidates(cursor, pathCandidates(cursor, base));
  }
  const base = slot.label === undefined ? cwd : (context ?? EMPTY_FILES_COMPLETIONS).workingDirOf(slot.label);
  const paths = base === undefined ? [] : pathCandidates(cursor, base);
  return combineCandidates(cursor, [...keywordCandidates(cursor, slot, slot.clauses), ...paths]);
}
