import { describe, it, expect } from 'vitest';
import {
  FILE_READ_PRIMER,
  FILE_READ_USAGE,
  isFileReadCommandLine,
  parseFileRead,
} from './command.js';

const usage = { error: FILE_READ_USAGE };

describe('parseFileRead', () => {
  it('fills in the default offset and limit', () => {
    expect(parseFileRead('file read notes/a.md')).toEqual({ path: 'notes/a.md', offset: 1, limit: 2000 });
  });

  it('accepts both flags in either order and on either side of the path', () => {
    const expected = { path: 'a.md', offset: 3, limit: 5 };
    expect(parseFileRead('file read --limit 5 a.md --offset 3')).toEqual(expected);
    expect(parseFileRead('file read a.md --offset 3 --limit 5')).toEqual(expected);
  });

  it('accepts a limit of 2000 and refuses 2001', () => {
    expect(parseFileRead('file read a.md --limit 2000')).toEqual({ path: 'a.md', offset: 1, limit: 2000 });
    expect(parseFileRead('file read a.md --limit 2001')).toEqual(usage);
  });

  it('accepts leading zeros in a flag value', () => {
    expect(parseFileRead('file read a.md --offset 007')).toEqual({ path: 'a.md', offset: 7, limit: 2000 });
  });

  it('returns the usage line for a missing or unknown command', () => {
    expect(parseFileRead('file')).toEqual(usage);
    expect(parseFileRead('file read')).toEqual(usage);
    expect(parseFileRead('file write x')).toEqual(usage);
    expect(parseFileRead('read x')).toEqual(usage);
  });

  it('returns the usage line for an offset that is not a positive safe integer', () => {
    expect(parseFileRead('file read a.md --offset 0')).toEqual(usage);
    expect(parseFileRead('file read a.md --offset -3')).toEqual(usage);
    expect(parseFileRead('file read a.md --offset 1.5')).toEqual(usage);
    expect(parseFileRead('file read a.md --offset 1e3')).toEqual(usage);
    expect(parseFileRead(`file read a.md --offset ${Number.MAX_SAFE_INTEGER}0`)).toEqual(usage);
  });

  it('returns the usage line for a missing or malformed limit value', () => {
    expect(parseFileRead('file read a.md --limit abc')).toEqual(usage);
    expect(parseFileRead('file read a.md --limit')).toEqual(usage);
    expect(parseFileRead('file read a.md --limit --offset 5')).toEqual(usage);
  });

  it('returns the usage line for an unknown flag', () => {
    expect(parseFileRead('file read a.md --limit=5')).toEqual(usage);
    expect(parseFileRead('file read a.md --ofset 5')).toEqual(usage);
  });

  it('returns the usage line for a repeated flag', () => {
    expect(parseFileRead('file read a.md --limit 5 --limit 10')).toEqual(usage);
  });

  it('returns the usage line for a second path', () => {
    expect(parseFileRead('file read a.md b.md')).toEqual(usage);
  });

  it('matches the keywords case-insensitively and keeps the path case', () => {
    expect(parseFileRead('FILE READ notes/a.md')).toEqual({ path: 'notes/a.md', offset: 1, limit: 2000 });
    expect(parseFileRead('file read Notes/A.md')).toEqual({ path: 'Notes/A.md', offset: 1, limit: 2000 });
  });

  it('returns the path verbatim', () => {
    expect(parseFileRead('file read ./notes/a.md')).toEqual({ path: './notes/a.md', offset: 1, limit: 2000 });
  });

  it('tolerates surrounding and repeated whitespace, including tabs', () => {
    expect(parseFileRead('  file   read\ta.md  --offset \t 4  ')).toEqual({ path: 'a.md', offset: 4, limit: 2000 });
  });
});

describe('FILE_READ_PRIMER', () => {
  it('is the three primer lines joined with newlines', () => {
    expect(FILE_READ_PRIMER).toBe([
      'To read a file in the workspace, end your reply with one line:',
      'file read <path> [--offset <line>] [--limit <lines>]',
      'Paths are relative to the workspace root. The output is numbered lines, at most 2000 per read; use --offset to continue a long file.',
    ].join('\n'));
  });
});

describe('isFileReadCommandLine', () => {
  it('accepts file read lines, with or without valid arguments', () => {
    expect(isFileReadCommandLine('file read x')).toBe(true);
    expect(isFileReadCommandLine('file read')).toBe(true);
    expect(isFileReadCommandLine('FILE  READ x')).toBe(true);
    expect(isFileReadCommandLine('file read --limit 9999')).toBe(true);
  });

  it('rejects lines that are not a whole-word file read', () => {
    expect(isFileReadCommandLine('files x')).toBe(false);
    expect(isFileReadCommandLine('file')).toBe(false);
    expect(isFileReadCommandLine('filed read x')).toBe(false);
    expect(isFileReadCommandLine('file read-x')).toBe(false);
  });
});
