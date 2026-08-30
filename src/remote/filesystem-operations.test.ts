import { describe, expect, it } from 'vitest';
import { FILESYSTEM_OPERATIONS, isFilesystemOperation, operationDescriptor } from './filesystem-operations.js';
import type { RemoteFilesystemArguments, RemoteFilesystemOperation } from './protocol.js';

// Written out rather than derived from the table, so an operation dropped from both the union and
// the table is still caught here. Adding one to the protocol means adding it in both places.
const ALL_OPERATIONS: RemoteFilesystemOperation[] = [
  'read-directory', 'stat', 'watch', 'unwatch', 'git', 'search', 'read-file', 'write-file',
  'move', 'move-many', 'delete', 'delete-many', 'rename', 'paste',
  'create-file', 'create-directory', 'replay',
];

// One representative argument record per operation, and the paths that record names. This is the
// case that pins the closed containment hole: an operation whose arguments carry paths under keys
// no shared fall-through knows about must still surrender every one of them.
const PATH_CASES: [RemoteFilesystemOperation, RemoteFilesystemArguments, string[]][] = [
  ['read-directory', { path: 'src' }, ['src']],
  ['stat', { paths: ['a.txt', 'b.txt'] }, ['a.txt', 'b.txt']],
  ['watch', { path: 'src' }, ['src']],
  ['unwatch', { path: 'src' }, ['src']],
  ['git', {}, []],
  ['search', {}, []],
  ['read-file', { path: 'a.txt' }, ['a.txt']],
  ['write-file', { path: 'a.txt', content: '' }, ['a.txt']],
  ['move', { from: 'a.txt', to: 'dest' }, ['a.txt', 'dest']],
  ['move-many', { sources: ['a.txt', 'b.txt'], destination: 'dest' }, ['a.txt', 'b.txt', 'dest']],
  ['delete', { path: 'a.txt' }, ['a.txt']],
  ['delete-many', { paths: ['a.txt', 'b.txt'] }, ['a.txt', 'b.txt']],
  ['rename', { path: 'a.txt', name: 'b.txt' }, ['a.txt']],
  ['paste', { sources: ['a.txt'], destination: 'dest', mode: 'copy' }, ['a.txt', 'dest']],
  ['create-file', { destination: 'dest' }, ['dest']],
  ['create-directory', { destination: 'dest' }, ['dest']],
  ['replay', {
    undoStack: [{ entries: [{ from: 'a.txt', to: 'dest/a.txt' }] }],
    redoStack: [{ mode: 'copy', pairs: [{ from: 'b.txt', to: 'dest/b.txt' }] }],
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
  ['search', { path: 'src' }],
  ['read-file', {}],
  ['write-file', { path: 'a.txt' }],
  ['move', { from: 'a.txt' }],
  ['move-many', { sources: ['a.txt'], destination: 'dest', policy: 'nonsense' }],
  ['delete', {}],
  ['delete-many', { paths: [1, 2] }],
  ['rename', { path: 'a.txt', name: '' }],
  ['paste', { sources: ['a.txt'], destination: 'dest', mode: 'link' }],
  ['create-file', {}],
  ['create-directory', { destination: 7 }],
  ['replay', { undoStack: [], redoStack: [], direction: 'sideways', overwrite: false, skipConflicts: false }],
];

const alphabetical = (names: readonly string[]) => names.toSorted((a, b) => a.localeCompare(b));

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

  it.each(PATH_CASES)('extracts every path %s names', (operation, args, expected) => {
    expect(operationDescriptor(operation).paths(args)).toEqual(expected);
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

  it('omits an absent conflict policy rather than decoding it as undefined', () => {
    const decoded = operationDescriptor('move-many').decode({ sources: ['a.txt'], destination: 'dest' });

    expect(Object.hasOwn(decoded, 'policy')).toBe(false);
    expect(operationDescriptor('move-many').decode({ sources: [], destination: '', policy: 'overwrite-all' }))
      .toMatchObject({ policy: 'overwrite-all' });
  });

  it('names a refusal shape for exactly the operations whose result can carry one', () => {
    const classified = ALL_OPERATIONS.filter((operation) => operationDescriptor(operation).refusal);

    expect(alphabetical(classified)).toEqual([
      'create-directory', 'create-file', 'delete', 'delete-many', 'move', 'move-many',
      'paste', 'rename', 'replay', 'write-file',
    ]);
  });

  it('treats an empty path as the root only for the operations that accept a root destination', () => {
    const rootDestination = ALL_OPERATIONS.filter((operation) => operationDescriptor(operation).rootDestination);

    expect(alphabetical(rootDestination)).toEqual([
      'create-directory', 'create-file', 'move', 'move-many', 'paste', 'read-directory', 'unwatch', 'watch',
    ]);
  });
});
