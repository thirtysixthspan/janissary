import { describe, expect, it } from 'vitest';
import { FILE_STAT_USAGE, isFileStatCommandLine, parseFileStat } from './command.js';

const usage = { error: FILE_STAT_USAGE };

describe('parseFileStat', () => {
  it('parses a single path argument', () => {
    expect(parseFileStat('file stat a.md')).toEqual({ path: 'a.md' });
  });

  it('matches the keywords case-insensitively and keeps the path case', () => {
    expect(parseFileStat('FILE STAT Docs/A.md')).toEqual({ path: 'Docs/A.md' });
  });

  it('tolerates surrounding and repeated whitespace including tabs', () => {
    expect(parseFileStat('  file\t stat \t a.md  ')).toEqual({ path: 'a.md' });
  });

  it('returns the usage line for a missing path', () => {
    expect(parseFileStat('file')).toEqual(usage);
    expect(parseFileStat('file stat')).toEqual(usage);
  });

  it('returns the usage line for a repeated path argument', () => {
    expect(parseFileStat('file stat a.md b.md')).toEqual(usage);
  });

  it('returns the usage line for an unknown or lookalike subcommand', () => {
    expect(parseFileStat('file list a.md')).toEqual(usage);
    expect(parseFileStat('file status a.md')).toEqual(usage);
    expect(parseFileStat('files stat a.md')).toEqual(usage);
  });

  it('uses the exact canonical usage line', () => {
    expect(FILE_STAT_USAGE).toBe('Usage: file stat <path>');
  });
});

describe('isFileStatCommandLine', () => {
  it('matches a file stat line with or without a path', () => {
    expect(isFileStatCommandLine('file stat a.md')).toBe(true);
    expect(isFileStatCommandLine('file stat')).toBe(true);
    expect(isFileStatCommandLine('FILE  STAT a.md')).toBe(true);
  });

  it('rejects lookalikes', () => {
    expect(isFileStatCommandLine('file')).toBe(false);
    expect(isFileStatCommandLine('file status a.md')).toBe(false);
    expect(isFileStatCommandLine('file stat-a.md')).toBe(false);
    expect(isFileStatCommandLine('files stat a.md')).toBe(false);
  });
});
