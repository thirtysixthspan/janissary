import { isFullyQuoted, readToken, skipSpaces, type Token } from '../command/quoted-token.js';
import type { FileNavigatorDetail } from '../tab/types.js';
import { readViewStep, type ViewStep } from './view-args.js';

export type FileNavigatorOpenArgs = {
  kind: 'open';
  inLabel?: string;
  missingInLabel?: boolean;
  dock: 'left' | 'right' | null;
  details?: FileNavigatorDetail;
  steps: ViewStep[];
  target: string;
};

export type ParsedFileNavigatorArgs =
  | FileNavigatorOpenArgs
  | { kind: 'print'; name: string }
  | { kind: 'error'; error: string };

type TrailingIn = { end: number; inLabel?: string; missingInLabel?: boolean };
type ClauseResult = { kind: 'consumed'; next: number } | { kind: 'missing' };
type ClauseFlags = { onSeen: boolean; bareSideUsed: boolean };
type TokenResult =
  | { kind: 'next'; index: number }
  | { kind: 'stop'; targetStart: number }
  | { kind: 'print'; name: string }
  | { kind: 'error'; error: string };

function bareWord(input: string, token: Token): string | undefined {
  return input.slice(token.start, token.end) === token.value ? token.value.toLowerCase() : undefined;
}

function readBareWord(input: string, start: number): { value: string; end: number } {
  let end = start;
  while (end < input.length && !/\s/.test(input[end] ?? '')) end++;
  return { value: input.slice(start, end), end };
}

function readTrailingIn(input: string, start: number): TrailingIn {
  const end = input.trimEnd().length;
  let cursor = skipSpaces(input, start);
  let previous: { start: number; bare: boolean; value: string } | undefined;
  let last: { start: number; end: number; bare: boolean; value: string } | undefined;
  while (cursor < end) {
    const token = readToken(input, cursor);
    if (!token || token.end > end) return { end };
    previous = last;
    last = {
      start: token.start,
      end: token.end,
      bare: input.slice(token.start, token.end) === token.value,
      value: token.value,
    };
    cursor = skipSpaces(input, token.end);
  }
  if (last?.bare && last.value.toLowerCase() === 'in') {
    return { end: last.start, missingInLabel: true };
  }
  if (previous?.bare && previous.value.toLowerCase() === 'in' && last) {
    const raw = input.slice(last.start, last.end);
    return { end: previous.start, inLabel: isFullyQuoted(raw) ? last.value : raw };
  }
  return { end };
}

function targetValue(input: string, start: number, end: number): string {
  const raw = input.slice(start, end).trim();
  const token = readToken(input, skipSpaces(input, start));
  if (!token || skipSpaces(input, token.end) < end || input.slice(token.start, token.end) === token.value) return raw;
  return isFullyQuoted(raw) ? token.value : raw;
}

function parsePrint(input: string, keywordEnd: number): ParsedFileNavigatorArgs | undefined {
  const nameStart = skipSpaces(input, keywordEnd);
  if (nameStart === input.length) return undefined;
  const name = readToken(input, nameStart);
  if (!name) return { kind: 'error', error: 'files: unterminated quote' };
  if (skipSpaces(input, name.end) < input.length) {
    return { kind: 'error', error: 'Usage: files print <tab>.' };
  }
  return { kind: 'print', name: name.value };
}

function readInClause(input: string, token: Token, parsed: FileNavigatorOpenArgs): ClauseResult {
  const valueStart = skipSpaces(input, token.end);
  if (valueStart === input.length) {
    parsed.missingInLabel = true;
    return { kind: 'missing' };
  }
  const quoted = readToken(input, valueStart);
  if (quoted && isFullyQuoted(input.slice(quoted.start, quoted.end))) {
    parsed.inLabel = quoted.value;
    return { kind: 'consumed', next: skipSpaces(input, quoted.end) };
  }
  const value = readBareWord(input, valueStart);
  parsed.inLabel = value.value;
  return { kind: 'consumed', next: skipSpaces(input, value.end) };
}

function readOnClause(input: string, token: Token, parsed: FileNavigatorOpenArgs, flags: ClauseFlags): ClauseResult | undefined {
  const valueStart = skipSpaces(input, token.end);
  const match = /^(left|right)\b/i.exec(input.slice(valueStart));
  if (!match) return undefined;
  parsed.dock = match[1].toLowerCase() as 'left' | 'right';
  flags.onSeen = true;
  return { kind: 'consumed', next: skipSpaces(input, valueStart + match[0].length) };
}

function readWithClause(input: string, token: Token, parsed: FileNavigatorOpenArgs): ClauseResult | undefined {
  const valueStart = skipSpaces(input, token.end);
  const match = /^(name|size|modified|permissions)\b/i.exec(input.slice(valueStart));
  if (!match) return undefined;
  parsed.details = match[1].toLowerCase() as FileNavigatorDetail;
  return { kind: 'consumed', next: skipSpaces(input, valueStart + match[0].length) };
}

function readBareSide(input: string, token: Token, parsed: FileNavigatorOpenArgs, flags: ClauseFlags): ClauseResult {
  parsed.dock = token.value.toLowerCase() as 'left' | 'right';
  flags.bareSideUsed = true;
  return { kind: 'consumed', next: skipSpaces(input, token.end) };
}

function readClause(
  input: string, token: Token, parsed: FileNavigatorOpenArgs, flags: ClauseFlags,
): ClauseResult | undefined {
  const word = bareWord(input, token);
  if (word === 'in' && parsed.inLabel === undefined) return readInClause(input, token, parsed);
  if (word === 'on' && !flags.onSeen) return readOnClause(input, token, parsed, flags);
  if (word === 'with' && parsed.details === undefined) return readWithClause(input, token, parsed);
  if ((word === 'left' || word === 'right') && parsed.inLabel === undefined && !flags.onSeen && !flags.bareSideUsed) {
    return readBareSide(input, token, parsed, flags);
  }
  return undefined;
}

function readStep(input: string, index: number, parsed: FileNavigatorOpenArgs): TokenResult | undefined {
  const result = readViewStep(input, index);
  if (!result) return undefined;
  if ('error' in result) return { kind: 'error', error: result.error };
  parsed.steps.push(result.step);
  return { kind: 'next', index: skipSpaces(input, result.next) };
}

function readNextToken(
  input: string, index: number, first: boolean, parsed: FileNavigatorOpenArgs, flags: ClauseFlags,
): TokenResult {
  const token = readToken(input, index);
  if (!token) return { kind: 'stop', targetStart: index };
  if (first && bareWord(input, token) === 'print') {
    const print = parsePrint(input, token.end);
    if (print?.kind === 'error') return print;
    if (print?.kind === 'print') return { kind: 'print', name: print.name };
  }
  const clause = readClause(input, token, parsed, flags);
  if (clause?.kind === 'missing') return { kind: 'stop', targetStart: input.length };
  if (clause?.kind === 'consumed') return { kind: 'next', index: clause.next };
  const step = readStep(input, index, parsed);
  if (step) return step;
  return { kind: 'stop', targetStart: token.start };
}

function initialArgs(): FileNavigatorOpenArgs {
  return { kind: 'open', dock: null, steps: [], target: '' };
}

export function parseFileNavigatorArgs(rest: string): ParsedFileNavigatorArgs {
  const parsed = initialArgs();
  let index = skipSpaces(rest, 0);
  let targetStart = index;
  let first = true;
  const flags: ClauseFlags = { onSeen: false, bareSideUsed: false };

  while (index < rest.length) {
    const tokenResult = readNextToken(rest, index, first, parsed, flags);
    first = false;
    if (tokenResult.kind === 'print' || tokenResult.kind === 'error') return tokenResult;
    if (tokenResult.kind === 'next') {
      index = tokenResult.index;
      targetStart = index;
      continue;
    }
    targetStart = tokenResult.targetStart;
    break;
  }

  if (parsed.inLabel === undefined && !parsed.missingInLabel) {
    const trailing = readTrailingIn(rest, targetStart);
    if (trailing.missingInLabel) parsed.missingInLabel = true;
    parsed.inLabel = trailing.inLabel;
    parsed.target = targetValue(rest, targetStart, trailing.end);
  } else {
    parsed.target = targetValue(rest, targetStart, rest.trimEnd().length);
  }
  return parsed;
}
