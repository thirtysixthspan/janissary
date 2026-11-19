import { describe, expect, it } from 'vitest';
import { FILE_EXISTS_USAGE, parseFileExists } from './command.js';

const usage = { error: FILE_EXISTS_USAGE };

describe('parseFileExists', () => {
  it('parses a single path argument', () => {
    expect(parseFileExists('file exists a.md')).toEqual({ path: 'a.md' });
  });

  it('matches the keywords case-insensitively and keeps the path case', () => {
    expect(parseFileExists('FILE EXISTS Docs/A.md')).toEqual({ path: 'Docs/A.md' });
  });

  it('tolerates surrounding and repeated whitespace including tabs', () => {
    expect(parseFileExists('  file\t exists \t a.md  ')).toEqual({ path: 'a.md' });
  });

  it('returns the usage line for a missing path', () => {
    expect(parseFileExists('file')).toEqual(usage);
    expect(parseFileExists('file exists')).toEqual(usage);
  });

  it('returns the usage line for a repeated path argument', () => {
    expect(parseFileExists('file exists a.md b.md')).toEqual(usage);
  });

  it('returns the usage line for an unknown or lookalike subcommand', () => {
    expect(parseFileExists('file stat a.md')).toEqual(usage);
    expect(parseFileExists('file exist a.md')).toEqual(usage);
    expect(parseFileExists('files exists a.md')).toEqual(usage);
  });

  it('uses the exact canonical usage line', () => {
    expect(FILE_EXISTS_USAGE).toBe('Usage: file exists <path>');
  });
});
