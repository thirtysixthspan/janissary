import { describe, it, expect } from 'vitest';
import {
  FILE_GLOB_PRIMER,
  FILE_GLOB_USAGE,
  formatGlobResult,
  isFileGlobCommandLine,
  parseFileGlob,
} from './command.js';

const usage = { error: FILE_GLOB_USAGE };

const defaults = { dir: undefined, hidden: false, dirs: false, limit: 100 };

describe('parseFileGlob', () => {
  it('fills in the defaults for the pattern alone', () => {
    expect(parseFileGlob('file glob **/*.ts')).toEqual({ pattern: '**/*.ts', ...defaults });
  });

  it('parses every flag in any order, before and after the pattern', () => {
    const expected = { pattern: '*.md', dir: 'docs', hidden: true, dirs: true, limit: 5 };
    expect(parseFileGlob('file glob *.md --path docs --hidden --dirs --limit 5')).toEqual(expected);
    expect(parseFileGlob('file glob --limit 5 --dirs --hidden --path docs *.md')).toEqual(expected);
    expect(parseFileGlob('file glob --hidden *.md --limit 5 --path docs --dirs')).toEqual(expected);
  });

  it('parses each flag on its own', () => {
    expect(parseFileGlob('file glob x --path src')).toEqual({ pattern: 'x', ...defaults, dir: 'src' });
    expect(parseFileGlob('file glob x --hidden')).toEqual({ pattern: 'x', ...defaults, hidden: true });
    expect(parseFileGlob('file glob x --dirs')).toEqual({ pattern: 'x', ...defaults, dirs: true });
    expect(parseFileGlob('file glob x --limit 20')).toEqual({ pattern: 'x', ...defaults, limit: 20 });
  });

  it('matches the keywords case-insensitively and keeps the pattern and path case', () => {
    expect(parseFileGlob('FILE GLOB *.TS --path Src')).toEqual({ pattern: '*.TS', ...defaults, dir: 'Src' });
  });

  it('tolerates surrounding and repeated whitespace, including tabs', () => {
    expect(parseFileGlob('  \tfile \t glob\t*.ts   --dirs \t')).toEqual({ pattern: '*.ts', ...defaults, dirs: true });
  });

  it('treats a single-dash token as a pattern', () => {
    expect(parseFileGlob('file glob -x')).toEqual({ pattern: '-x', ...defaults });
  });

  it('passes the pattern and path through verbatim', () => {
    expect(parseFileGlob('file glob {a,b --path ../x')).toEqual({ pattern: '{a,b', ...defaults, dir: '../x' });
  });

  it('returns the usage line for a missing or unknown command', () => {
    expect(parseFileGlob('file')).toEqual(usage);
    expect(parseFileGlob('file glob')).toEqual(usage);
    expect(parseFileGlob('file read x')).toEqual(usage);
  });

  it('returns the usage line for a second pattern', () => {
    expect(parseFileGlob('file glob a b')).toEqual(usage);
  });

  it('returns the usage line for an unknown flag', () => {
    expect(parseFileGlob('file glob x --limit=5')).toEqual(usage);
    expect(parseFileGlob('file glob x --hiden')).toEqual(usage);
  });

  it('returns the usage line for a pattern that starts with --', () => {
    expect(parseFileGlob('file glob --x.ts')).toEqual(usage);
  });

  it('returns the usage line for a repeated flag', () => {
    expect(parseFileGlob('file glob x --path a --path b')).toEqual(usage);
    expect(parseFileGlob('file glob x --hidden --hidden')).toEqual(usage);
    expect(parseFileGlob('file glob x --dirs --dirs')).toEqual(usage);
    expect(parseFileGlob('file glob x --limit 5 --limit 6')).toEqual(usage);
  });

  it('returns the usage line for a missing path value', () => {
    expect(parseFileGlob('file glob x --path')).toEqual(usage);
    expect(parseFileGlob('file glob x --path --hidden')).toEqual(usage);
  });

  it('returns the usage line for a missing or malformed limit', () => {
    expect(parseFileGlob('file glob x --limit')).toEqual(usage);
    expect(parseFileGlob('file glob x --limit 0')).toEqual(usage);
    expect(parseFileGlob('file glob x --limit 1001')).toEqual(usage);
    expect(parseFileGlob('file glob x --limit x')).toEqual(usage);
    expect(parseFileGlob('file glob x --limit 1.5')).toEqual(usage);
    expect(parseFileGlob('file glob x --limit -3')).toEqual(usage);
  });

  it('accepts limits from 1 to 1000 and leading zeros', () => {
    expect(parseFileGlob('file glob x --limit 1000')).toEqual({ pattern: 'x', ...defaults, limit: 1000 });
    expect(parseFileGlob('file glob x --limit 1')).toEqual({ pattern: 'x', ...defaults, limit: 1 });
    expect(parseFileGlob('file glob x --limit 007')).toEqual({ pattern: 'x', ...defaults, limit: 7 });
  });
});

describe('isFileGlobCommandLine', () => {
  it('recognizes a file glob command line', () => {
    expect(isFileGlobCommandLine('file glob')).toBe(true);
    expect(isFileGlobCommandLine('file glob *.ts')).toBe(true);
    expect(isFileGlobCommandLine('FILE  GLOB x')).toBe(true);
  });

  it('rejects other lines', () => {
    expect(isFileGlobCommandLine('file')).toBe(false);
    expect(isFileGlobCommandLine('file globs')).toBe(false);
    expect(isFileGlobCommandLine('file glob-x')).toBe(false);
    expect(isFileGlobCommandLine('file read x')).toBe(false);
    expect(isFileGlobCommandLine('files glob')).toBe(false);
  });
});

describe('formatGlobResult', () => {
  const none = { limit: 100, truncated: false, timedOut: false };
  const truncationLine = '(showing the first 2 matches; narrow the pattern or raise --limit)';
  const timeoutLine = '(search stopped after 30 seconds; narrow the pattern or --path)';

  it('reports an empty result', () => {
    expect(formatGlobResult([], none)).toBe('(no matches)');
  });

  it('prints one path per line', () => {
    expect(formatGlobResult(['a.ts', 'src/', 'src/b.ts'], none)).toBe('a.ts\nsrc/\nsrc/b.ts');
  });

  it('appends the truncation line with the limit', () => {
    expect(formatGlobResult(['a', 'b'], { ...none, limit: 2, truncated: true })).toBe(`a\nb\n${truncationLine}`);
  });

  it('appends the timeout line, including after no matches', () => {
    expect(formatGlobResult(['a'], { ...none, timedOut: true })).toBe(`a\n${timeoutLine}`);
    expect(formatGlobResult([], { ...none, timedOut: true })).toBe(`(no matches)\n${timeoutLine}`);
  });

  it('prints only the truncation line when truncated and timed out', () => {
    expect(formatGlobResult(['a', 'b'], { limit: 2, truncated: true, timedOut: true })).toBe(`a\nb\n${truncationLine}`);
  });
});

describe('FILE_GLOB_PRIMER', () => {
  it('is the four primer lines', () => {
    expect(FILE_GLOB_PRIMER).toBe([
      'To find files in the workspace by path, end your reply with one line:',
      'file glob <pattern> [--path <dir>] [--hidden] [--dirs] [--limit <n>]',
      'Patterns are case-sensitive and relative to --path (default: the workspace root): ** spans folders, * stays within one name, ? is one character, {a,b} is either. Results are workspace-relative paths, at most 100 by default; hidden and git-ignored paths are skipped unless --hidden is given, and --dirs lists folders instead of files.',
      'Example: file glob **/*.test.ts --path src',
    ].join('\n'));
  });
});
