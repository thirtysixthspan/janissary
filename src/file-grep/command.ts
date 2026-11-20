import { positiveInteger } from '../positive-integer.js';
import { SEARCH_MAX_RESULTS } from '../search/types.js';

export type FileGrepArgs = {
  pattern: string;
  include: string;
  exclude: string;
  literal: boolean;
  word: boolean;
  caseSensitive: boolean;
  limit: number;
  path: string | undefined;
};

export const FILE_GREP_DEFAULT_LIMIT = 100;

export const FILE_GREP_USAGE = 'Usage: file grep [--literal] [--word] [--case-sensitive] [--path <path>] [--include <globs>] [--exclude <globs>] [--limit <n>] [--] <pattern>';

const switches = new Map<string, 'literal' | 'word' | 'caseSensitive'>([
  ['--literal', 'literal'],
  ['--word', 'word'],
  ['--case-sensitive', 'caseSensitive'],
]);

const stringFlags = new Map<string, 'path' | 'include' | 'exclude'>([
  ['--path', 'path'],
  ['--include', 'include'],
  ['--exclude', 'exclude'],
]);

const repeatableFlags = new Set(['--include', '--exclude']);

function appendGlob(args: FileGrepArgs, key: 'include' | 'exclude', value: string): void {
  args[key] = args[key] === '' ? value : `${args[key]},${value}`;
}

function scanFlag(args: FileGrepArgs, flag: string, tokens: RegExp, input: string): boolean {
  const switchKey = switches.get(flag);
  if (switchKey !== undefined) {
    args[switchKey] = true;
    return true;
  }
  const stringKey = stringFlags.get(flag);
  if (stringKey === undefined && flag !== '--limit') return false;
  const value = tokens.exec(input)?.[0];
  if (value === undefined || value.startsWith('--')) return false;
  if (stringKey !== undefined) {
    if (stringKey === 'include' || stringKey === 'exclude') {
      appendGlob(args, stringKey, value);
    } else {
      args[stringKey] = value;
    }
    return true;
  }
  const limit = positiveInteger(value);
  if (limit === undefined || limit > SEARCH_MAX_RESULTS) return false;
  args.limit = limit;
  return true;
}

function scanArguments(input: string, offset: number): FileGrepArgs | undefined {
  const args: FileGrepArgs = {
    pattern: '',
    include: '',
    exclude: '',
    literal: false,
    word: false,
    caseSensitive: false,
    limit: FILE_GREP_DEFAULT_LIMIT,
    path: undefined,
  };
  const tokens = /\S+/g;
  tokens.lastIndex = offset;
  const seen = new Set<string>();
  let token: RegExpExecArray | null;
  while ((token = tokens.exec(input)) !== null) {
    const flag = token[0];
    if (flag === '--') {
      const pattern = tokens.exec(input);
      if (pattern === null) return undefined;
      args.pattern = input.slice(pattern.index);
      return args;
    }
    if (!flag.startsWith('--')) {
      args.pattern = input.slice(token.index);
      return args;
    }
    if ((seen.has(flag) && !repeatableFlags.has(flag)) || !scanFlag(args, flag, tokens, input)) return undefined;
    seen.add(flag);
  }
  return undefined;
}

export function parseFileGrep(input: string): FileGrepArgs | { error: string } {
  const trimmed = input.trim();
  const command = /^file\s+grep(\s|$)/i.exec(trimmed);
  if (command === null) return { error: FILE_GREP_USAGE };
  return scanArguments(trimmed, command[0].length) ?? { error: FILE_GREP_USAGE };
}

export function isFileGrepCommandLine(line: string): boolean {
  return /^file\s+grep(\s|$)/i.test(line);
}

export const FILE_GREP_PRIMER = [
  'To find text inside workspace files, put exactly one command inside a final fenced block whose info string is exactly `janissary`. Write the command without a `janissary` prefix; prose may follow the block.',
  'file grep [--literal] [--word] [--case-sensitive] [--path <path>] [--include <globs>] [--exclude <globs>] [--limit <n>] [--] <pattern>',
  'Flags come first; the rest of the line is the pattern, a case-insensitive regular expression unless --literal or --case-sensitive. Results are path:line: text, at most 100 by default; --include and --exclude take comma-separated globs such as *.ts,*.tsx.',
  String.raw`Example: file grep --include *.ts function\s+parse`,
].join('\n');
