import { describe, it, expect } from 'vitest';
import {
  FILE_GREP_DEFAULT_LIMIT,
  FILE_GREP_PRIMER,
  FILE_GREP_USAGE,
  isFileGrepCommandLine,
  parseFileGrep,
  type FileGrepArgs,
} from './command.js';

const syntax = 'file grep [--literal] [--word] [--case-sensitive] [--path <path>] [--include <globs>] [--exclude <globs>] [--limit <n>] [--] <pattern>';
const usage = { error: `Usage: ${syntax}` };
const defaults: FileGrepArgs = {
  pattern: 'needle',
  include: '',
  exclude: '',
  literal: false,
  word: false,
  caseSensitive: false,
  limit: 100,
  path: undefined,
};
const singleUseFlagCases: Array<[string, Partial<FileGrepArgs>]> = [
  ['--literal', { literal: true }],
  ['--word', { word: true }],
  ['--case-sensitive', { caseSensitive: true }],
  ['--path ./Src/', { path: './Src/' }],
  ['--limit 7', { limit: 7 }],
];
const repeatableFlagCases: Array<[string, Partial<FileGrepArgs>]> = [
  ['--include *.ts,*.tsx', { include: '*.ts,*.tsx' }],
  ['--exclude **/Tests/**', { exclude: '**/Tests/**' }],
];
const flagCases = [...singleUseFlagCases, ...repeatableFlagCases];
const valuedFlags = ['--path', '--include', '--exclude', '--limit'];

describe('parseFileGrep', () => {
  it('fills every default, including a present undefined path', () => {
    expect(FILE_GREP_DEFAULT_LIMIT).toBe(100);
    const result = parseFileGrep('file grep needle');
    expect(result).toStrictEqual(defaults);
    expect(Object.hasOwn(result, 'path')).toBe(true);
  });

  it.each(flagCases)('accepts the individual flag %s', (flag, expected) => {
    expect(parseFileGrep(`file grep ${flag} needle`)).toStrictEqual({ ...defaults, ...expected });
  });

  it.each([
    '--literal --path ./Src/ --word --include *.ts,*.tsx --limit 7 --case-sensitive --exclude **/Tests/**',
    '--exclude **/Tests/** --case-sensitive --limit 7 --include *.ts,*.tsx --word --path ./Src/ --literal',
  ])('accepts mixed flag orders: %s', (flags) => {
    expect(parseFileGrep(`file grep ${flags} needle`)).toStrictEqual({
      pattern: 'needle', path: './Src/', include: '*.ts,*.tsx', exclude: '**/Tests/**',
      literal: true, word: true, caseSensitive: true, limit: 7,
    });
  });

  it.each([
    ['file grep request  timed\tout', 'request  timed\tout'],
    [' \tfile \t grep\t  needle  \t', 'needle'],
    ['FiLe\tGrEp Needle', 'Needle'],
    ['file grep "request timed out"', '"request timed out"'],
    [String.raw`file grep function\s+parse`, String.raw`function\s+parse`],
    ['file grep [unclosed', '[unclosed'],
    ['file grep -needle', '-needle'],
    ['file grep x --path missing', 'x --path missing'],
    ['file grep x --word --word --unknown --', 'x --word --word --unknown --'],
    ['file grep -- --limit', '--limit'],
    ['file grep -- \t  --word  needle\ttext ', '--word  needle\ttext'],
    ['file grep -- --', '--'],
    ['file grep --literal needle --literal', 'needle --literal'],
  ])('preserves the pattern in %j', (input, pattern) => {
    const literal = input.includes('--literal');
    expect(parseFileGrep(input)).toStrictEqual({ ...defaults, literal, pattern });
  });

  it('matches keywords case-insensitively while preserving every value', () => {
    expect(parseFileGrep('FILE GREP --path ./Src/ --include *.TS,*.TSX --exclude **/Tests/** Needle')).toStrictEqual({
      ...defaults, path: './Src/', include: '*.TS,*.TSX', exclude: '**/Tests/**', pattern: 'Needle',
    });
  });

  it('preserves quotes, backslashes and unnormalized string flag values', () => {
    expect(parseFileGrep(String.raw`file grep --path ./Src/../Src\Dir/ --include "*.TS" --exclude **\Tests\** needle`)).toStrictEqual({
      ...defaults, path: String.raw`./Src/../Src\Dir/`, include: '"*.TS"', exclude: String.raw`**\Tests\**`,
    });
  });

  it.each(['--path', '--include', '--exclude'])('accepts single-dash values for %s', (flag) => {
    const key = flag.slice(2);
    expect(parseFileGrep(`file grep ${flag} -value needle`)).toStrictEqual({ ...defaults, [key]: '-value' });
  });

  it('consumes just one token for a string flag value', () => {
    expect(parseFileGrep('file grep --path "my notes" needle')).toStrictEqual({
      ...defaults, path: '"my', pattern: 'notes" needle',
    });
  });

  it('parses the planned path example', () => {
    expect(parseFileGrep('file grep --path src FILE_READ_USAGE')).toStrictEqual({
      ...defaults, path: 'src', pattern: 'FILE_READ_USAGE',
    });
  });

  it.each(['', ' ', 'file', 'file grep', 'file grep \t', 'grep needle', 'files grep needle',
    'file read needle', 'file greps needle', 'file grep-x needle', '/file grep needle',
    'filegrep needle', 'file grep --', 'file grep -- \t'])('returns only usage for %j', (input) => {
    expect(parseFileGrep(input)).toStrictEqual(usage);
  });

  it.each(flagCases)('requires a pattern after %s', (flag) => {
    expect(parseFileGrep(`file grep ${flag}`)).toStrictEqual(usage);
  });

  it.each(singleUseFlagCases)('refuses a repeated flag before the pattern: %s', (flag) => {
    expect(parseFileGrep(`file grep ${flag} ${flag} needle`)).toStrictEqual(usage);
  });

  it.each([
    ['include', '--include *.ts --include *.tsx', '*.ts,*.tsx'],
    ['exclude', '--exclude **/Tests/** --exclude **/*.d.ts', '**/Tests/**,**/*.d.ts'],
  ] as const)('accumulates repeated --%s flags', (key, flags, expected) => {
    expect(parseFileGrep(`file grep ${flags} needle`)).toStrictEqual({ ...defaults, [key]: expected });
  });

  it('accumulates repeated include and exclude flags together in the order typed', () => {
    expect(parseFileGrep('file grep --include *.ts --exclude **/Tests/** --include *.tsx --exclude **/*.d.ts needle')).toStrictEqual({
      ...defaults, include: '*.ts,*.tsx', exclude: '**/Tests/**,**/*.d.ts',
    });
  });

  it('keeps commas written inside a repeated flag value', () => {
    expect(parseFileGrep('file grep --include src/*.ts,*.tsx --include *.mts --include *.cts needle')).toStrictEqual({
      ...defaults, include: 'src/*.ts,*.tsx,*.mts,*.cts',
    });
  });

  it.each(['--include', '--exclude'])('refuses a repeated %s with no value', (flag) => {
    expect(parseFileGrep(`file grep ${flag} *.ts ${flag}`)).toStrictEqual(usage);
  });

  it.each(['--include', '--exclude'])('refuses a repeated %s with a flag-looking value', (flag) => {
    expect(parseFileGrep(`file grep ${flag} *.ts ${flag} --word needle`)).toStrictEqual(usage);
  });

  it.each(flagCases)('refuses uppercase flag spelling: %s', (flag) => {
    expect(parseFileGrep(`file grep ${flag.toUpperCase()} needle`)).toStrictEqual(usage);
  });

  it.each(['--unknown', '--Literal', '--limit=2', '--path=src', '--word=true', '---'])('refuses unknown prefix flag %s', (flag) => {
    expect(parseFileGrep(`file grep ${flag} needle`)).toStrictEqual(usage);
  });

  it.each(valuedFlags)('requires a value for %s', (flag) => {
    expect(parseFileGrep(`file grep ${flag}`)).toStrictEqual(usage);
  });

  it.each(valuedFlags.flatMap((flag) => ['--', '--word', '--unknown', '--limit=2'].map((value) => [flag, value])))
  ('refuses double-dash value %s %s', (flag, value) => {
    expect(parseFileGrep(`file grep ${flag} ${value} needle`)).toStrictEqual(usage);
  });

  it.each([['1', 1], ['250', 250], ['007', 7]] as const)('accepts limit %s', (value, limit) => {
    expect(parseFileGrep(`file grep --limit ${value} needle`)).toStrictEqual({ ...defaults, limit });
  });

  it.each(['0', '251', '-1', '1.5', '1e2', 'abc', '9007199254740992', '+2', '2x'])('refuses invalid limit %s', (value) => {
    expect(parseFileGrep(`file grep --limit ${value} needle`)).toStrictEqual(usage);
  });
});

describe('isFileGrepCommandLine', () => {
  it.each(['file grep', 'file grep needle', 'FILE  GREP needle', 'file\tgrep needle',
    'file grep --unknown', 'file grep --limit 9999', 'file grep --', 'file grep '])('accepts %j', (line) => {
    expect(isFileGrepCommandLine(line)).toBe(true);
  });

  it.each(['', 'file', 'file read needle', 'file greps', 'file grep-x', 'filegrep needle',
    'files grep needle', ' file grep needle', '\tfile grep', '/file grep'])('rejects %j', (line) => {
    expect(isFileGrepCommandLine(line)).toBe(false);
  });
});

describe('file grep text', () => {
  it('exports the exact usage', () => {
    expect(FILE_GREP_USAGE).toBe(`Usage: ${syntax}`);
  });

  it('exports the primer with one fenced example, a single backslash and no trailing newline', () => {
    expect(FILE_GREP_PRIMER).toBe([
      'To find text inside workspace files, put exactly one command inside a final fenced block whose info string is exactly `janissary`. Write the command without a `janissary` prefix; prose may follow the block.',
      syntax,
      'Flags come first; the rest of the line is the pattern, a case-insensitive regular expression unless --literal or --case-sensitive. Results are path:line: text, at most 100 by default; --include and --exclude take comma-separated globs such as *.ts,*.tsx.',
      'Example:',
      '```janissary',
      String.raw`file grep --include *.ts function\s+parse`,
      '```',
    ].join('\n'));
    expect(FILE_GREP_PRIMER.split('\n')).toHaveLength(7);
    expect(FILE_GREP_PRIMER.split('\n').slice(-3)).toEqual([
      '```janissary',
      String.raw`file grep --include *.ts function\s+parse`,
      '```',
    ]);
    expect(FILE_GREP_PRIMER.match(/\\/g)).toHaveLength(1);
    expect(FILE_GREP_PRIMER.endsWith('\n')).toBe(false);
  });
});
