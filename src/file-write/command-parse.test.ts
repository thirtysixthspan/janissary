import { describe, it, expect } from 'vitest';
import { FILE_EDIT_USAGE, FILE_WRITE_USAGE, parseFileMutation } from './command.js';

const writeUsage = { error: FILE_WRITE_USAGE };
const editUsage = { error: FILE_EDIT_USAGE };

describe('parseFileMutation write requests', () => {
  it('parses a write without expectedHash and leaves it absent', () => {
    const result = parseFileMutation('file write {"path":"a.txt","content":"hi"}');
    expect(result).toEqual({ kind: 'write', path: 'a.txt', content: 'hi' });
    expect(Object.hasOwn(result, 'expectedHash')).toBe(false);
  });

  it('parses a write with expectedHash', () => {
    expect(parseFileMutation('file write {"path":"a","content":"b","expectedHash":"abc"}')).toEqual({
      kind: 'write',
      path: 'a',
      content: 'b',
      expectedHash: 'abc',
    });
  });

  it('accepts uppercase commands and surrounding or repeated whitespace', () => {
    expect(parseFileMutation('FILE WRITE {"path":"a","content":"b"}')).toEqual({ kind: 'write', path: 'a', content: 'b' });
    expect(parseFileMutation('  file   write    {"path":"a","content":"b"}  ')).toEqual({
      kind: 'write',
      path: 'a',
      content: 'b',
    });
  });

  it('accepts empty content and an empty expectedHash', () => {
    expect(parseFileMutation('file write {"path":"a","content":""}')).toEqual({ kind: 'write', path: 'a', content: '' });
    expect(parseFileMutation('file write {"path":"a","content":"x","expectedHash":""}')).toEqual({
      kind: 'write',
      path: 'a',
      content: 'x',
      expectedHash: '',
    });
  });

  it('returns paths with spaces and content with newlines and space runs byte-for-byte', () => {
    const line = String.raw`file write {"path":"my dir/a b.txt","content":"one\ntwo   three"}`;
    expect(parseFileMutation(line)).toEqual({ kind: 'write', path: 'my dir/a b.txt', content: 'one\ntwo   three' });
  });
});

describe('parseFileMutation usage errors', () => {
  it('returns each subcommand usage for a bare command', () => {
    expect(parseFileMutation('file write')).toEqual(writeUsage);
    expect(parseFileMutation('file edit')).toEqual(editUsage);
    expect(parseFileMutation('file write    ')).toEqual(writeUsage);
  });

  it.each([
    ['malformed JSON', 'file write {not json'],
    ['an array', 'file write []'],
    ['null', 'file write null'],
    ['a string', 'file write "x"'],
    ['a number', 'file write 3'],
    ['a missing path', 'file write {"content":"b"}'],
    ['a missing content', 'file write {"path":"a"}'],
    ['a numeric path', 'file write {"path":1,"content":"b"}'],
    ['a numeric expectedHash', 'file write {"path":"a","content":"b","expectedHash":1}'],
    ['no separator after a longer word', 'file writer {"path":"a","content":"b"}'],
    ['no separator before the JSON', 'file write{"path":"a","content":"b"}'],
    ['an empty path', 'file write {"path":"","content":"b"}'],
    ['other first words', 'file read a.txt'],
  ])('rejects %s', (_name, line) => {
    expect(parseFileMutation(line)).toEqual(writeUsage);
  });
});

describe('parseFileMutation interim edit behavior', () => {
  it('returns the edit usage for a well-formed edit object', () => {
    expect(parseFileMutation('file edit {"path":"a","oldString":"x","newString":"y"}')).toEqual(editUsage);
  });

  it('returns the edit usage for malformed edit JSON', () => {
    expect(parseFileMutation('file edit {oops')).toEqual(editUsage);
  });
});
