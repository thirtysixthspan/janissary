import { describe, expect, it } from 'vitest';
import { FILE_LIST_USAGE, isFileListCommandLine, parseFileList } from './command.js';

const usage = { error: FILE_LIST_USAGE };

describe('parseFileList', () => {
  it('parses list and ls into the same typed argument', () => {
    expect(parseFileList('file list docs')).toEqual({ path: 'docs' });
    expect(parseFileList('file ls docs')).toEqual({ path: 'docs' });
  });

  it('matches the keywords case-insensitively and keeps the path case', () => {
    expect(parseFileList('FILE LS Docs/A.md')).toEqual({ path: 'Docs/A.md' });
  });

  it('tolerates surrounding and repeated whitespace including tabs', () => {
    expect(parseFileList('  file\t  ls \t docs  ')).toEqual({ path: 'docs' });
  });

  it('returns the usage line for a missing path', () => {
    expect(parseFileList('file')).toEqual(usage);
    expect(parseFileList('file list')).toEqual(usage);
    expect(parseFileList('file ls')).toEqual(usage);
  });

  it('returns the usage line for a repeated path argument', () => {
    expect(parseFileList('file list a b')).toEqual(usage);
    expect(parseFileList('file ls a b')).toEqual(usage);
  });

  it('returns the list usage line for an unknown or lookalike subcommand', () => {
    expect(parseFileList('file read a')).toEqual(usage);
    expect(parseFileList('file listing a')).toEqual(usage);
    expect(parseFileList('files list a')).toEqual(usage);
  });

  it('uses the exact canonical usage line', () => {
    expect(FILE_LIST_USAGE).toBe('Usage: file list <path>');
  });
});

describe('isFileListCommandLine', () => {
  it('matches both list spellings with or without a path', () => {
    expect(isFileListCommandLine('file list docs')).toBe(true);
    expect(isFileListCommandLine('file ls')).toBe(true);
    expect(isFileListCommandLine('FILE  LS docs')).toBe(true);
  });

  it('rejects lookalikes', () => {
    expect(isFileListCommandLine('file')).toBe(false);
    expect(isFileListCommandLine('file listing docs')).toBe(false);
    expect(isFileListCommandLine('file ls-docs')).toBe(false);
    expect(isFileListCommandLine('files ls docs')).toBe(false);
  });
});
