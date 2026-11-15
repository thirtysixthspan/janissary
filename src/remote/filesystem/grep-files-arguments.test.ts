import { describe, expect, it } from 'vitest';
import type { FileGrepArgs } from '../../file-grep/command.js';
import { decodeFileGrepArgs, validFileGrepArgs } from './grep-files-arguments.js';

const INVALID_ARGUMENTS = 'Invalid remote filesystem operation arguments.';
const DECODED_KEYS = ['caseSensitive', 'exclude', 'include', 'limit', 'literal', 'path', 'pattern', 'word'];

const BASE_ARGS: Record<string, unknown> = {
  pattern: 'TODO',
  include: '',
  exclude: '',
  literal: false,
  word: false,
  caseSensitive: false,
  limit: 100,
};

const DEFAULT_DECODED: FileGrepArgs = {
  pattern: 'TODO',
  include: '',
  exclude: '',
  literal: false,
  word: false,
  caseSensitive: false,
  limit: 100,
  path: undefined,
};

const BACKSLASH_PATTERN = String.raw`  \s+TODO\s+  `;
const BACKSLASH_INCLUDE = String.raw`  src\**\*.ts  `;
const BACKSLASH_EXCLUDE = String.raw`  **\*.test.ts  `;
const MALFORMED_PATTERN = '[unclosed(';
const COMMAND_PATTERN = '--literal --word TODO --limit 5';

function withoutKey(field: string): Record<string, unknown> {
  const copy = { ...BASE_ARGS };
  delete copy[field];
  return copy;
}

function expectAccepted(input: Record<string, unknown>, expected: FileGrepArgs): void {
  expect(validFileGrepArgs(input)).toBe(true);
  const decoded = decodeFileGrepArgs(input);
  expect(Object.hasOwn(decoded, 'path')).toBe(true);
  expect(Object.keys(decoded).toSorted((a, b) => a.localeCompare(b))).toEqual(DECODED_KEYS);
  expect(decoded).toStrictEqual(expected);
}

function expectRejected(input: Record<string, unknown>): void {
  expect(validFileGrepArgs(input)).toBe(false);
  expect(() => decodeFileGrepArgs(input)).toThrow(INVALID_ARGUMENTS);
}

const ACCEPTED_CASES: [string, Record<string, unknown>, FileGrepArgs][] = [
  [
    'an absent path, all-false switches and the minimum limit',
    { pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 1 },
    { ...DEFAULT_DECODED, limit: 1 },
  ],
  [
    'an explicit undefined path',
    { ...BASE_ARGS, path: undefined },
    { ...DEFAULT_DECODED },
  ],
  [
    'an empty path',
    { ...BASE_ARGS, path: '' },
    { ...DEFAULT_DECODED, path: '' },
  ],
  [
    'an ordinary path, mixed switches and the maximum limit',
    {
      ...BASE_ARGS, pattern: 'needle', include: 'src/**/*.ts,*.tsx', exclude: '**/*.test.ts',
      literal: true, word: false, caseSensitive: true, limit: 250, path: 'src/file-grep',
    },
    {
      ...DEFAULT_DECODED, pattern: 'needle', include: 'src/**/*.ts,*.tsx', exclude: '**/*.test.ts',
      literal: true, word: false, caseSensitive: true, limit: 250, path: 'src/file-grep',
    },
  ],
  [
    'all true switches',
    { ...BASE_ARGS, literal: true, word: true, caseSensitive: true },
    { ...DEFAULT_DECODED, literal: true, word: true, caseSensitive: true },
  ],
  [
    'empty pattern, include and exclude strings',
    { ...BASE_ARGS, pattern: '', include: '', exclude: '' },
    { ...DEFAULT_DECODED, pattern: '' },
  ],
  [
    'whitespace and backslashes across string fields',
    { ...BASE_ARGS, pattern: BACKSLASH_PATTERN, include: BACKSLASH_INCLUDE, exclude: BACKSLASH_EXCLUDE },
    { ...DEFAULT_DECODED, pattern: BACKSLASH_PATTERN, include: BACKSLASH_INCLUDE, exclude: BACKSLASH_EXCLUDE },
  ],
  [
    'malformed regex text',
    { ...BASE_ARGS, pattern: MALFORMED_PATTERN },
    { ...DEFAULT_DECODED, pattern: MALFORMED_PATTERN },
  ],
  [
    'command-looking pattern text containing flags',
    { ...BASE_ARGS, pattern: COMMAND_PATTERN },
    { ...DEFAULT_DECODED, pattern: COMMAND_PATTERN },
  ],
];

const REQUIRED_FIELD_CASES: [string, Record<string, unknown>][] = [
  ['omits pattern', withoutKey('pattern')],
  ['pattern is undefined', { ...BASE_ARGS, pattern: undefined }],
  ['omits include', withoutKey('include')],
  ['include is undefined', { ...BASE_ARGS, include: undefined }],
  ['omits exclude', withoutKey('exclude')],
  ['exclude is undefined', { ...BASE_ARGS, exclude: undefined }],
  ['omits literal', withoutKey('literal')],
  ['literal is undefined', { ...BASE_ARGS, literal: undefined }],
  ['omits word', withoutKey('word')],
  ['word is undefined', { ...BASE_ARGS, word: undefined }],
  ['omits caseSensitive', withoutKey('caseSensitive')],
  ['caseSensitive is undefined', { ...BASE_ARGS, caseSensitive: undefined }],
  ['omits limit', withoutKey('limit')],
  ['limit is undefined', { ...BASE_ARGS, limit: undefined }],
];

const WRONG_TYPE_CASES: [string, Record<string, unknown>][] = [
  ['numeric pattern', { ...BASE_ARGS, pattern: 42 }],
  ['null include', { ...BASE_ARGS, include: null }],
  ['array exclude', { ...BASE_ARGS, exclude: [] }],
  ['string literal switch', { ...BASE_ARGS, literal: 'true' }],
  ['numeric word switch', { ...BASE_ARGS, word: 1 }],
  ['object caseSensitive switch', { ...BASE_ARGS, caseSensitive: {} }],
  ['string limit', { ...BASE_ARGS, limit: '100' }],
];

const PATH_CASES: [string, Record<string, unknown>][] = [
  ['null path', { ...BASE_ARGS, path: null }],
  ['numeric path', { ...BASE_ARGS, path: 3 }],
  ['boolean path', { ...BASE_ARGS, path: true }],
  ['array path', { ...BASE_ARGS, path: ['src'] }],
  ['object path', { ...BASE_ARGS, path: { dir: 'src' } }],
];

const LIMIT_CASES: [string, Record<string, unknown>][] = [
  ['zero limit', { ...BASE_ARGS, limit: 0 }],
  ['negative limit', { ...BASE_ARGS, limit: -1 }],
  ['limit above the search maximum', { ...BASE_ARGS, limit: 251 }],
  ['fractional limit', { ...BASE_ARGS, limit: 1.5 }],
  ['NaN limit', { ...BASE_ARGS, limit: NaN }],
  ['positive infinity limit', { ...BASE_ARGS, limit: Infinity }],
  ['negative infinity limit', { ...BASE_ARGS, limit: -Infinity }],
  ['null limit', { ...BASE_ARGS, limit: null }],
  ['boolean limit', { ...BASE_ARGS, limit: true }],
  ['array limit', { ...BASE_ARGS, limit: [] }],
  ['object limit', { ...BASE_ARGS, limit: {} }],
  ['unsafe integer limit', { ...BASE_ARGS, limit: Number.MAX_SAFE_INTEGER + 1 }],
];

describe('grep-files remote arguments', () => {
  it.each(ACCEPTED_CASES)('validates and decodes %s', (_name, input, expected) => {
    expectAccepted(input, expected);
  });

  it('drops an unknown field without mutating the input record', () => {
    const input = { ...BASE_ARGS, extra: 'sneaky' };
    const snapshot = { ...input };

    expectAccepted(input, { ...DEFAULT_DECODED });
    expect(input).toStrictEqual(snapshot);
  });

  it.each(REQUIRED_FIELD_CASES)('rejects a record that %s', (_name, input) => {
    expectRejected(input);
  });

  it.each(WRONG_TYPE_CASES)('rejects a %s', (_name, input) => {
    expectRejected(input);
  });

  it.each(PATH_CASES)('rejects a %s', (_name, input) => {
    expectRejected(input);
  });

  it.each(LIMIT_CASES)('rejects a %s', (_name, input) => {
    expectRejected(input);
  });
});
