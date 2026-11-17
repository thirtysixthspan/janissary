import { describe, expect, it } from 'vitest';
import {
  decodeFilesystemResult, FILESYSTEM_OPERATIONS, isFilesystemOperation, operationDescriptor,
  type RemoteFilesystemOperationResult,
} from './operations.js';
import type { RemoteFilesystemArgumentsByOperation, RemoteFilesystemOperation } from '../protocol-frames.js';
import { FILE_READ_MAX_LIMIT } from '../../file-read/command.js';
import { FILE_GLOB_MAX_LIMIT } from '../../file-glob/command.js';
import { SEARCH_MAX_RESULTS } from '../../search/types.js';
import {
  WEB_SEARCH_MAX_CHARS, WEB_SEARCH_MAX_RESULTS, WEB_SEARCH_MIN_CHARS, WEB_SEARCH_MIN_RESULTS,
} from '../../web/search/command.js';
import {
  WEB_FETCH_MAX_CHARS, WEB_FETCH_MAX_TIMEOUT_SECONDS, WEB_FETCH_MIN_CHARS, WEB_FETCH_MIN_OFFSET,
  WEB_FETCH_MIN_TIMEOUT_SECONDS,
} from '../../web/fetch/command.js';

// Written out rather than derived from the table, so an operation dropped from both the union and
// the table is still caught here. Adding one to the protocol means adding it in both places.
const ALL_OPERATIONS: RemoteFilesystemOperation[] = [
  'read-directory', 'stat', 'watch', 'unwatch', 'git', 'git-pull', 'git-commit', 'search',
  'search-text', 'read-file', 'read-lines', 'glob-paths', 'grep-files', 'web-search', 'web-fetch', 'write-file', 'edit-file', 'apply-patch', 'move', 'move-many', 'delete', 'delete-many', 'rename', 'paste',
  'create-file', 'create-directory', 'replay', 'change-set',
];

// One representative argument record per operation, and the paths that record names. This is the
// case that pins the closed containment hole: an operation whose arguments carry paths under keys
// no shared fall-through knows about must still surrender every one of them.
type PathCase = {
  [K in RemoteFilesystemOperation]: [K, RemoteFilesystemArgumentsByOperation[K], string[]]
}[RemoteFilesystemOperation];

const PATH_CASES: PathCase[] = [
  ['read-directory', { path: 'src' }, ['src']],
  ['stat', { paths: ['a.txt', 'b.txt'] }, ['a.txt', 'b.txt']],
  ['watch', { path: 'src' }, ['src']],
  ['unwatch', { path: 'src' }, ['src']],
  ['git', {}, []],
  ['git-pull', {}, []],
  // The workspace's own change set, with the files to expand to whole-file context. No path of its
  // own: one workspace per peer, so the directory is the session's.
  ['change-set', { fullFiles: ['a.txt'], source: 'staged' }, []],
  ['git-commit', { message: 'commit: a.txt', paths: ['a.txt', 'b.txt'] }, ['a.txt', 'b.txt']],
  ['git-commit', { message: 'commit: 2 files', paths: [], root: 'src' }, ['src']],
  ['search', {}, []],
  ['search-text', { root: '', query: 'todo', include: 'src/**', exclude: '', regex: false, matchCase: false, wholeWord: false }, ['']],
  ['read-file', { path: 'a.txt' }, ['a.txt']],
  ['read-lines', { path: 'a.txt', offset: 3, limit: 10 }, ['a.txt']],
  ['glob-paths', { pattern: '**/*.ts' }, []],
  ['glob-paths', { pattern: '*.ts', dir: 'src', hidden: true, dirs: true, limit: 20 }, ['src']],
  ['grep-files', {
    pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100, path: undefined,
  }, []],
  ['grep-files', {
    pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100, path: '',
  }, ['']],
  ['grep-files', {
    pattern: 'TODO', include: 'src/**', exclude: '**/*.test.ts', literal: true, word: true, caseSensitive: true, limit: 250, path: 'src',
  }, ['src']],
  ['web-search', { query: 'vitest', numResults: 10, maxChars: 10_000, depth: 'basic', provider: 'auto' }, []],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 'auto' }, []],
  ['write-file', { path: 'a.txt', content: '', expectedHash: 'baseline' }, ['a.txt']],
  ['write-file', { path: 'a.txt', content: '', policy: 'tool-text' }, ['a.txt']],
  ['edit-file', { path: 'a.txt', oldString: 'b2xk', newString: '', replaceAll: false }, ['a.txt']],
  ['apply-patch', { patchText: Buffer.from('*** Add File: a.md\n+hi\n*** End Patch').toString('base64') }, []],
  ['move', { from: 'a.txt', to: 'dest' }, ['a.txt', 'dest']],
  ['move', { from: 'a.txt', to: 'dest', overwrite: true }, ['a.txt', 'dest']],
  ['move-many', { sources: ['a.txt', 'b.txt'], destination: 'dest' }, ['a.txt', 'b.txt', 'dest']],
  ['delete', { path: 'a.txt' }, ['a.txt']],
  ['delete-many', { paths: ['a.txt', 'b.txt'] }, ['a.txt', 'b.txt']],
  ['rename', { path: 'a.txt', name: 'b.txt' }, ['a.txt']],
  ['rename', { path: 'a.txt', name: 'b.txt', overwrite: true }, ['a.txt']],
  ['paste', { sources: ['a.txt'], destination: 'dest', mode: 'copy' }, ['a.txt', 'dest']],
  ['create-file', { destination: 'dest' }, ['dest']],
  ['create-directory', { destination: 'dest' }, ['dest']],
  ['replay', {
    undoStack: [{ entries: [{ from: 'a.txt', to: 'dest/a.txt' }] }],
    redoStack: [{ mode: 'copy', pairs: [{ from: 'b.txt', to: 'dest/b.txt', identity: 'sha256:recorded' }] }],
    direction: 'undo', overwrite: false, skipConflicts: false,
  }, ['a.txt', 'dest/a.txt', 'b.txt', 'dest/b.txt']],
];

// Argument records each operation must reject: a missing key, a wrong type, or a value outside the
// allowed set. Rejection is what keeps a malformed frame from reaching the filesystem at all.
const INVALID_CASES: [RemoteFilesystemOperation, Record<string, unknown>][] = [
  ['read-directory', {}],
  ['stat', { paths: 'a.txt' }],
  ['watch', { path: 3 }],
  ['unwatch', {}],
  ['git', { path: 'src' }],
  ['git-pull', { path: 'src' }],
  ['change-set', { fullFiles: 'a.txt', source: 'all' }],
  ['change-set', { fullFiles: [3], source: 'all' }],
  ['change-set', { fullFiles: ['a.txt'] }],
  ['change-set', { fullFiles: ['a.txt'], source: 'HEAD~1' }],
  ['git-commit', { message: '', paths: ['a.txt'] }],
  ['git-commit', { message: 'x', paths: [], root: 3 }],
  ['search', { path: 'src' }],
  ['search-text', { root: '', query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: 'yes' }],
  ['search-text', { root: 1, query: 'todo', include: '', exclude: '', regex: false, matchCase: false, wholeWord: false }],
  ['read-file', {}],
  ['read-lines', { offset: 1 }],
  ['read-lines', { path: 'a.txt', offset: 0 }],
  ['read-lines', { path: 'a.txt', limit: -1 }],
  ['read-lines', { path: 'a.txt', offset: 1.5 }],
  ['read-lines', { path: 'a.txt', limit: '5' }],
  ['read-lines', { path: 'a.txt', limit: FILE_READ_MAX_LIMIT + 1 }],
  ['glob-paths', {}],
  ['glob-paths', { pattern: 3 }],
  ['glob-paths', { pattern: '*.ts', dir: 3 }],
  ['glob-paths', { pattern: '*.ts', hidden: 'yes' }],
  ['glob-paths', { pattern: '*.ts', dirs: 'yes' }],
  ['glob-paths', { pattern: '*.ts', limit: 0 }],
  ['glob-paths', { pattern: '*.ts', limit: FILE_GLOB_MAX_LIMIT + 1 }],
  ['glob-paths', { pattern: '*.ts', limit: 1.5 }],
  ['glob-paths', { pattern: '*.ts', limit: '5' }],
  ['glob-paths', { pattern: '*?'.repeat(12) + 'Z' }],
  ['glob-paths', { pattern: 'a'.repeat(1025) }],
  ['glob-paths', { pattern: 'x' + String.raw`\{a,b}`.repeat(16) }],
  ['glob-paths', { pattern: String.raw`*a*a*\{b,c,d}` }],
  ['glob-paths', { pattern: '**/../a/b/'.repeat(13) + 'c' }],
  ['glob-paths', { pattern: '{..,x}/a' }],
  ['glob-paths', { pattern: String.raw`a\..\b` }],
  ['grep-files', { pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false }],
  ['grep-files', { pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100, path: 3 }],
  ['grep-files', { pattern: 'TODO', include: '', exclude: '', literal: 'no', word: false, caseSensitive: false, limit: 100 }],
  ['grep-files', { pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 0 }],
  ['grep-files', { pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: SEARCH_MAX_RESULTS + 1 }],
  ['web-search', { numResults: 10, maxChars: 10_000, depth: 'basic', provider: 'auto' }],
  ['web-search', { query: '', numResults: 10, maxChars: 10_000, depth: 'basic', provider: 'auto' }],
  ['web-search', { query: 3, numResults: 10, maxChars: 10_000, depth: 'basic', provider: 'auto' }],
  ['web-search', { query: 'vitest', numResults: WEB_SEARCH_MIN_RESULTS - 1, maxChars: 10_000, depth: 'basic', provider: 'auto' }],
  ['web-search', { query: 'vitest', numResults: WEB_SEARCH_MAX_RESULTS + 1, maxChars: 10_000, depth: 'basic', provider: 'auto' }],
  ['web-search', { query: 'vitest', numResults: 1.5, maxChars: 10_000, depth: 'basic', provider: 'auto' }],
  ['web-search', { query: 'vitest', numResults: '5', maxChars: 10_000, depth: 'basic', provider: 'auto' }],
  ['web-search', { query: 'vitest', numResults: 10, maxChars: WEB_SEARCH_MIN_CHARS - 1, depth: 'basic', provider: 'auto' }],
  ['web-search', { query: 'vitest', numResults: 10, maxChars: WEB_SEARCH_MAX_CHARS + 1, depth: 'basic', provider: 'auto' }],
  ['web-search', { query: 'vitest', numResults: 10, maxChars: 10_000, depth: 'deep', provider: 'auto' }],
  ['web-search', { query: 'vitest', numResults: 10, maxChars: 10_000, depth: 'Advanced', provider: 'auto' }],
  ['web-search', { query: 'vitest', numResults: 10, maxChars: 10_000, depth: 'basic' }],
  ['web-search', { query: 'vitest', numResults: 10, maxChars: 10_000, depth: 'basic', provider: 3 }],
  ['web-fetch', { format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: '', format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 3, format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 'ftp://example.com', format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 'not a url', format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'Markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'pdf', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 0, maxChars: 10_000, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 121, maxChars: 10_000, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 1.5, maxChars: 10_000, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: '30', maxChars: 10_000, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 30, maxChars: 199, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 30, maxChars: 100_001, offset: 0, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: -1, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 1.5, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: Number.MAX_SAFE_INTEGER + 1, provider: 'auto' }],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0 }],
  ['web-fetch', { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 3 }],
  ['write-file', { path: 'a.txt' }],
  ['write-file', { path: 'a.txt', content: '', expectedHash: null }],
  ['write-file', { path: 'a.txt', content: '', expectedHash: 7 }],
  ['write-file', { path: 'a.txt', content: '', policy: 'other' }],
  ['write-file', { path: 'a.txt', content: '', policy: 7 }],
  ['write-file', { path: 'a.txt', content: '', policy: null }],
  ['edit-file', { path: 'a.txt', newString: '', replaceAll: false }],
  ['edit-file', { path: 'a.txt', oldString: 'b2xk', newString: '' }],
  ['edit-file', { path: 'a.txt', oldString: 'b2xk', newString: '', replaceAll: 'true' }],
  ['edit-file', { path: 'a.txt', oldString: '!!', newString: '', replaceAll: false }],
  ['edit-file', { path: 'a.txt', oldString: Buffer.from([0xff]).toString('base64'), newString: '', replaceAll: false }],
  ['apply-patch', {}],
  ['apply-patch', { patchText: 3 }],
  ['apply-patch', { patchText: Buffer.from('*** Add File: a.md\n+hi').toString('base64'), extra: true }],
  ['apply-patch', { patchText: '!!' }],
  ['apply-patch', { patchText: Buffer.from([0xff]).toString('base64') }],
  ['move', { from: 'a.txt' }],
  ['move', { from: 'a.txt', to: 'dest', overwrite: 'yes' }],
  ['move-many', { sources: ['a.txt'], destination: 'dest', policy: 'nonsense' }],
  ['delete', {}],
  ['delete-many', { paths: [1, 2] }],
  ['rename', { path: 'a.txt', name: '' }],
  ['rename', { path: 'a.txt', name: 'b.txt', overwrite: 'yes' }],
  ['paste', { sources: ['a.txt'], destination: 'dest', mode: 'link' }],
  ['create-file', {}],
  ['create-directory', { destination: 7 }],
  ['replay', { undoStack: [], redoStack: [], direction: 'sideways', overwrite: false, skipConflicts: false }],
  ['replay', { undoStack: [{ mode: 'copy', pairs: [{ from: 'a', to: 'b', identity: 3 }] }], redoStack: [], direction: 'undo', overwrite: false, skipConflicts: false }],
];

const alphabetical = (names: readonly string[]) => names.toSorted((a, b) => a.localeCompare(b));

const VALID_RESULTS: { [K in RemoteFilesystemOperation]: RemoteFilesystemOperationResult<K> } = {
  'read-directory': [{ name: 'entry', dir: false }],
  stat: { 'a.txt': { size: 1, modified: 2, mode: 3 } },
  watch: {}, unwatch: {},
  git: { statuses: [['a.txt', 'changed']] },
  'git-pull': 'Updated branch',
  'change-set': { kind: 'files', files: [] },
  'git-commit': { committed: false },
  search: ['a.txt'],
  'search-text': [],
  'read-file': { content: 'YQ==' },
  'read-lines': { text: '1\ta' },
  'glob-paths': { text: 'src/a.ts' },
  'grep-files': { text: 'src/a.ts:1: TODO' },
  'web-search': { text: '1. [Vitest](https://vitest.dev)' },
  'web-fetch': { text: 'Source: https://example.com/page' },
  'write-file': { ok: false, reason: 'denied' },
  'edit-file': { ok: true, value: { replacements: 2 } },
  'apply-patch': { text: 'Patched 1 file:\nA a.md' },
  move: { ok: true, value: { from: 'a.txt', to: 'dest/a.txt' } },
  'move-many': { total: 1, failedPaths: [], moved: [{ from: 'a.txt', to: 'dest/a.txt' }], mutated: true },
  delete: { ok: false, reason: 'denied' },
  'delete-many': { total: 1, failedPaths: [], mutated: false },
  rename: { conflict: true },
  paste: { total: 1, failedPaths: [], pairs: [], mutated: false },
  'create-file': { ok: true, value: { path: 'new.txt' } },
  'create-directory': { ok: true, value: { path: 'new-dir' } },
  replay: { result: {}, undoStack: [], redoStack: [], mutated: false },
};

describe('FILESYSTEM_OPERATIONS', () => {
  it('has one entry for every operation in the protocol, and no others', () => {
    expect(alphabetical(Object.keys(FILESYSTEM_OPERATIONS))).toEqual(alphabetical(ALL_OPERATIONS));
  });

  it('recognizes every operation and nothing else', () => {
    for (const operation of ALL_OPERATIONS) expect(isFilesystemOperation(operation)).toBe(true);
    expect(isFilesystemOperation('not-an-operation')).toBe(false);
    expect(isFilesystemOperation('toString')).toBe(false);
    expect(isFilesystemOperation(undefined)).toBe(false);
  });

  it('decodes a valid result for every operation', () => {
    for (const operation of ALL_OPERATIONS) {
      expect(decodeFilesystemResult(operation, VALID_RESULTS[operation])).toEqual(VALID_RESULTS[operation]);
    }
  });

  it('rejects a paste result with an invalid recorded identity', () => {
    expect(() => decodeFilesystemResult('paste', {
      total: 1, failedPaths: [], mutated: true,
      pairs: [{ from: 'source', to: 'destination', identity: 7 }],
    })).toThrow('Invalid remote filesystem operation result.');
  });

  it('rejects a search row with an invalid context shape', () => {
    expect(() => decodeFilesystemResult('search-text', [{ path: 'a.ts', line: 1, above: [2], match: 'todo', start: 0, end: 4, below: [] }]))
      .toThrow('Invalid remote filesystem operation result.');
  });

  it.each(ALL_OPERATIONS)('rejects a malformed %s result', (operation) => {
    expect(() => decodeFilesystemResult(operation, null)).toThrow('Invalid remote filesystem operation result.');
  });

  it.each(PATH_CASES)('extracts every path %s names', (operation, args, expected) => {
    expect(operationDescriptor(operation).paths(args as never)).toEqual(expected);
  });

  it.each(PATH_CASES)('accepts a well-formed %s argument record', (operation, args) => {
    expect(operationDescriptor(operation).valid(args as Record<string, unknown>)).toBe(true);
  });

  it.each(INVALID_CASES)('rejects a malformed %s argument record', (operation, args) => {
    expect(operationDescriptor(operation).valid(args)).toBe(false);
  });

  it.each(PATH_CASES)('decodes %s to the keys it carries and no others', (operation, args) => {
    const decoded = operationDescriptor(operation).decode(args as Record<string, unknown>);

    expect(alphabetical(Object.keys(decoded))).toEqual(alphabetical(Object.keys(args)));
  });

  it('drops any key the operation does not carry', () => {
    const decoded = operationDescriptor('read-directory').decode({ path: 'src', name: 'sneaky' });

    expect(decoded).toEqual({ path: 'src' });
  });

  it('rejects malformed values when a decoder is called without its validator', () => {
    expect(() => operationDescriptor('move').decode({ from: 7, to: 'dest' }))
      .toThrow('Invalid remote filesystem operation arguments.');
    expect(() => operationDescriptor('replay').decode({
      undoStack: [{ entries: [{ from: 'a', to: 3 }] }], redoStack: [],
      direction: 'undo', overwrite: false, skipConflicts: false,
    })).toThrow('Invalid remote filesystem operation arguments.');
  });

  it('omits an absent conflict policy rather than decoding it as undefined', () => {
    const decoded = operationDescriptor('move-many').decode({ sources: ['a.txt'], destination: 'dest' });

    expect(Object.hasOwn(decoded, 'policy')).toBe(false);
    expect(operationDescriptor('move-many').decode({ sources: [], destination: '', policy: 'overwrite-all' }))
      .toMatchObject({ policy: 'overwrite-all' });
  });

  it('omits an absent move overwrite flag rather than decoding it as undefined', () => {
    expect(Object.hasOwn(operationDescriptor('move').decode({ from: 'a.txt', to: 'dest' }), 'overwrite')).toBe(false);
    expect(operationDescriptor('move').decode({ from: 'a.txt', to: 'dest', overwrite: false }))
      .toEqual({ from: 'a.txt', to: 'dest', overwrite: false });
  });

  it('omits an absent rename overwrite flag and decodes consent when present', () => {
    expect(Object.hasOwn(operationDescriptor('rename').decode({ path: 'a.txt', name: 'b.txt' }), 'overwrite')).toBe(false);
    expect(operationDescriptor('rename').decode({ path: 'a.txt', name: 'b.txt', overwrite: true }))
      .toEqual({ path: 'a.txt', name: 'b.txt', overwrite: true });
  });

  it('omits an absent write precondition and decodes a supplied hash', () => {
    expect(Object.hasOwn(operationDescriptor('write-file').decode({ path: 'a.txt', content: '' }), 'expectedHash'))
      .toBe(false);
    expect(operationDescriptor('write-file').decode({ path: 'a.txt', content: '', expectedHash: 'baseline' }))
      .toEqual({ path: 'a.txt', content: '', expectedHash: 'baseline' });
  });

  it('accepts read-lines bounds and decodes only the integers it was sent', () => {
    const readLines = operationDescriptor('read-lines');

    expect(readLines.valid({ path: 'a.txt' })).toBe(true);
    expect(readLines.valid({ path: 'a.txt', offset: 5, limit: 20 })).toBe(true);
    expect(readLines.valid({ path: 'a.txt', limit: FILE_READ_MAX_LIMIT })).toBe(true);
    const decoded = readLines.decode({ path: 'a.txt' });
    expect(Object.hasOwn(decoded, 'offset')).toBe(false);
    expect(Object.hasOwn(decoded, 'limit')).toBe(false);
    expect(() => readLines.decode({ path: 'a.txt', offset: 0 }))
      .toThrow('Invalid remote filesystem operation arguments.');
  });

  it('rejects a read-lines result without string text', () => {
    expect(() => decodeFilesystemResult('read-lines', {})).toThrow('Invalid remote filesystem operation result.');
    expect(() => decodeFilesystemResult('read-lines', { text: 3 })).toThrow('Invalid remote filesystem operation result.');
  });

  it('accepts a glob-paths limit bound and decodes only the fields it was sent', () => {
    const globPaths = operationDescriptor('glob-paths');

    expect(globPaths.valid({ pattern: '*.ts', limit: FILE_GLOB_MAX_LIMIT })).toBe(true);
    const decoded = globPaths.decode({ pattern: '*.ts' });
    expect(decoded).toEqual({ pattern: '*.ts' });
    for (const key of ['dir', 'hidden', 'dirs', 'limit']) expect(Object.hasOwn(decoded, key)).toBe(false);
    expect(() => globPaths.decode({ pattern: '*.ts', limit: 0 }))
      .toThrow('Invalid remote filesystem operation arguments.');
  });

  it('rejects a glob-paths result without string text', () => {
    expect(() => decodeFilesystemResult('glob-paths', {})).toThrow('Invalid remote filesystem operation result.');
    expect(() => decodeFilesystemResult('glob-paths', { text: 3 })).toThrow('Invalid remote filesystem operation result.');
  });

  it('extracts no grep-files path when the request omits one', () => {
    const grepFiles = operationDescriptor('grep-files');

    expect(grepFiles.valid({
      pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100,
    })).toBe(true);
    expect(grepFiles.paths({
      pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100,
    })).toEqual([]);
  });

  it('materializes a present undefined grep-files path and drops extra keys', () => {
    const base = { pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false, limit: 100 };
    const decoded = operationDescriptor('grep-files').decode({ ...base, extra: 'drop' });

    expect(Object.hasOwn(decoded, 'path')).toBe(true);
    expect(decoded.path).toBeUndefined();
    expect(Object.keys(decoded).toSorted((a, b) => a.localeCompare(b)))
      .toEqual(['caseSensitive', 'exclude', 'include', 'limit', 'literal', 'path', 'pattern', 'word']);
  });

  it('rejects malformed grep-files arguments when the decoder is called without its validator', () => {
    const base = { pattern: 'TODO', include: '', exclude: '', literal: false, word: false, caseSensitive: false };

    expect(() => operationDescriptor('grep-files').decode({ ...base, limit: '100' }))
      .toThrow('Invalid remote filesystem operation arguments.');
  });

  it('keeps formatted grep-files text verbatim, including a diagnostic trailer', () => {
    const text = 'src/a.ts:1: TODO\n(no matches)\n(search stopped after 30 seconds; narrow the pattern or --path)';

    expect(decodeFilesystemResult('grep-files', { text })).toEqual({ text });
  });

  it('accepts empty grep-files text', () => {
    expect(decodeFilesystemResult('grep-files', { text: '' })).toEqual({ text: '' });
  });

  it('rejects a grep-files result without string text', () => {
    for (const bad of [{}, { text: 3 }, null, []]) {
      expect(() => decodeFilesystemResult('grep-files', bad)).toThrow('Invalid remote filesystem operation result.');
    }
  });

  it('treats grep-files as a root destination with no refusal callback', () => {
    expect(operationDescriptor('grep-files').rootDestination).toBe(true);
    expect(operationDescriptor('grep-files').refusal).toBeUndefined();
  });

  it('accepts both web-search range edges and decodes only its five fields', () => {
    const webSearch = operationDescriptor('web-search');
    const args = { query: 'vitest', numResults: 10, maxChars: 10_000, depth: 'basic', provider: 'auto' };

    for (const numResults of [WEB_SEARCH_MIN_RESULTS, WEB_SEARCH_MAX_RESULTS]) {
      expect(webSearch.valid({ ...args, numResults })).toBe(true);
    }
    for (const maxChars of [WEB_SEARCH_MIN_CHARS, WEB_SEARCH_MAX_CHARS]) {
      expect(webSearch.valid({ ...args, maxChars })).toBe(true);
    }
    expect(webSearch.decode({ ...args, extra: 'ignored' })).toEqual(args);
    expect(() => webSearch.decode({ ...args, numResults: WEB_SEARCH_MIN_RESULTS - 1 }))
      .toThrow('Invalid remote filesystem operation arguments.');
  });

  it('accepts a web-search result only with non-empty text', () => {
    expect(decodeFilesystemResult('web-search', { text: '1. [Vitest](https://vitest.dev)' }))
      .toEqual({ text: '1. [Vitest](https://vitest.dev)' });
    for (const bad of [{}, { text: 3 }, { text: '' }]) {
      expect(() => decodeFilesystemResult('web-search', bad)).toThrow('Invalid remote filesystem operation result.');
    }
  });

  it('accepts web-fetch range edges and URLs and decodes only its six fields', () => {
    const webFetch = operationDescriptor('web-fetch');
    const args = { url: 'https://example.com/page', format: 'markdown', timeoutSeconds: 30, maxChars: 10_000, offset: 0, provider: 'auto' };

    for (const timeoutSeconds of [WEB_FETCH_MIN_TIMEOUT_SECONDS, WEB_FETCH_MAX_TIMEOUT_SECONDS]) {
      expect(webFetch.valid({ ...args, timeoutSeconds })).toBe(true);
    }
    for (const maxChars of [WEB_FETCH_MIN_CHARS, WEB_FETCH_MAX_CHARS]) {
      expect(webFetch.valid({ ...args, maxChars })).toBe(true);
    }
    for (const offset of [WEB_FETCH_MIN_OFFSET, Number.MAX_SAFE_INTEGER]) {
      expect(webFetch.valid({ ...args, offset })).toBe(true);
    }
    for (const url of ['HTTPS://Example.com/A', 'http://localhost:3000/x']) {
      expect(webFetch.valid({ ...args, url })).toBe(true);
      expect(webFetch.decode({ ...args, url })).toMatchObject({ url });
    }
    expect(webFetch.decode({ ...args, extra: 'ignored' })).toEqual(args);
    expect(() => webFetch.decode({ ...args, timeoutSeconds: 0 }))
      .toThrow('Invalid remote filesystem operation arguments.');
  });

  it('accepts a web-fetch result only with non-empty text', () => {
    expect(decodeFilesystemResult('web-fetch', { text: 'Source: https://example.com/page' }))
      .toEqual({ text: 'Source: https://example.com/page' });
    for (const bad of [{}, { text: 3 }, { text: '' }]) {
      expect(() => decodeFilesystemResult('web-fetch', bad)).toThrow('Invalid remote filesystem operation result.');
    }
  });

  it('decodes edit-file arguments to plain text', () => {
    expect(operationDescriptor('edit-file').decode({
      path: 'a.txt', oldString: Buffer.from('old é').toString('base64'), newString: '', replaceAll: true,
    })).toEqual({ path: 'a.txt', oldString: 'old é', newString: '', replaceAll: true });
    expect(() => operationDescriptor('edit-file').decode({ path: 'a.txt', oldString: '!!', newString: '', replaceAll: true }))
      .toThrow('Invalid remote filesystem operation arguments.');
  });

  it('keeps a leading byte order mark in decoded edit-file strings', () => {
    const bom = String.fromCodePoint(0xFE_FF);
    expect(operationDescriptor('edit-file').decode({
      path: 'a.txt', oldString: Buffer.from(`${bom}old`).toString('base64'),
      newString: Buffer.from(`${bom}new`).toString('base64'), replaceAll: false,
    })).toEqual({ path: 'a.txt', oldString: `${bom}old`, newString: `${bom}new`, replaceAll: false });
  });

  it('accepts an edit-file count or failure and rejects anything else', () => {
    expect(decodeFilesystemResult('edit-file', { ok: true, value: { replacements: 1 } })).toEqual({ ok: true, value: { replacements: 1 } });
    expect(decodeFilesystemResult('edit-file', { ok: false, reason: 'No matching text' })).toEqual({ ok: false, reason: 'No matching text' });
    for (const bad of [{ ok: true, value: { replacements: 0 } }, { ok: true, value: { replacements: 1.5 } }, { ok: true, value: {} }, { ok: false, reason: 3 }]) {
      expect(() => decodeFilesystemResult('edit-file', bad)).toThrow('Invalid remote filesystem operation result.');
    }
  });

  it('decodes apply-patch arguments to plain text', () => {
    expect(operationDescriptor('apply-patch').decode({
      patchText: Buffer.from('*** Add File: é.md\n+hi').toString('base64'),
    })).toEqual({ patchText: '*** Add File: é.md\n+hi' });
    expect(() => operationDescriptor('apply-patch').decode({ patchText: '!!' }))
      .toThrow('Invalid remote filesystem operation arguments.');
  });

  it('keeps a leading byte order mark in decoded apply-patch text', () => {
    const bom = String.fromCodePoint(0xFE_FF);
    expect(operationDescriptor('apply-patch').decode({
      patchText: Buffer.from(`${bom}*** Add File: a.md\n+hi`).toString('base64'),
    })).toEqual({ patchText: `${bom}*** Add File: a.md\n+hi` });
  });

  it('accepts non-empty apply-patch text and rejects anything else', () => {
    expect(decodeFilesystemResult('apply-patch', { text: 'Patched 1 file:\nA a.md' }))
      .toEqual({ text: 'Patched 1 file:\nA a.md' });
    for (const bad of [{ text: '' }, {}, { text: 3 }, null, []]) {
      expect(() => decodeFilesystemResult('apply-patch', bad)).toThrow('Invalid remote filesystem operation result.');
    }
  });

  it('names a refusal shape for exactly the operations whose result can carry one', () => {
    const classified = ALL_OPERATIONS.filter((operation) => operationDescriptor(operation).refusal);

    expect(alphabetical(classified)).toEqual([
      'create-directory', 'create-file', 'delete', 'delete-many', 'edit-file', 'move', 'move-many',
      'paste', 'rename', 'replay', 'write-file',
    ]);
  });

  it('treats an empty path as the root only for the operations that accept a root destination', () => {
    const rootDestination = ALL_OPERATIONS.filter((operation) => operationDescriptor(operation).rootDestination);

    expect(alphabetical(rootDestination)).toEqual([
      'create-directory', 'create-file', 'git-commit', 'glob-paths', 'grep-files', 'move', 'move-many', 'paste',
      'read-directory', 'read-lines', 'search-text', 'unwatch', 'watch',
    ]);
  });
});
