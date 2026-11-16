import { describe, expect, it } from 'vitest';
import type { SearchMatch } from '../search/types.js';
import { formatGrepResult, previewLine } from './format.js';
import type { GrepEnding } from './format.js';

const ellipsis = '…';
const limitLine = (limit: number) => `(showing the first ${limit} matches; narrow the pattern or raise --limit)`;
const timeoutLine = '(search stopped after 30 seconds; narrow the pattern or --path)';
const slowLine = (path: string) => `(search stopped: the pattern took too long on ${path}; simplify it or use --literal)`;

function match(overrides: Partial<SearchMatch> = {}): SearchMatch {
  return {
    path: 'src/a.ts',
    line: 1,
    above: [],
    match: 'const value = 1;',
    start: 6,
    end: 11,
    below: [],
    ...overrides,
  };
}

describe('formatGrepResult', () => {
  it('prints a nested path, a one-based line number, and the preview', () => {
    const row = match({
      path: 'src/file-read/command.ts',
      line: 9,
      match: 'export const FILE_READ_USAGE = usage;',
      start: 13,
      end: 28,
    });
    expect(formatGrepResult([row])).toBe('src/file-read/command.ts:9: export const FILE_READ_USAGE = usage;');
  });

  it('keeps the supplied order across paths and lines', () => {
    const rows = [
      match({ path: 'src/z.ts', line: 20, match: 'zeta', start: 0, end: 4 }),
      match({ path: 'src/a.ts', line: 3, match: 'alpha', start: 0, end: 5 }),
      match({ path: 'src/a.ts', line: 1, match: 'beta', start: 0, end: 4 }),
    ];
    expect(formatGrepResult(rows)).toBe('src/z.ts:20: zeta\nsrc/a.ts:3: alpha\nsrc/a.ts:1: beta');
  });

  it('ignores context lines', () => {
    const withContext = match({ above: ['before'], below: ['after'] });
    expect(formatGrepResult([withContext])).toBe(formatGrepResult([match()]));
  });

  it('does not mutate the supplied rows', () => {
    const rows = [match({ above: ['before'], below: ['after'] })];
    const before = structuredClone(rows);
    formatGrepResult(rows, { kind: 'timeout' });
    expect(rows).toEqual(before);
  });

  it('prints the no-match sentinel alone when there are no rows and no ending', () => {
    expect(formatGrepResult([])).toBe('(no matches)');
  });

  it('treats an absent and an explicitly undefined ending alike', () => {
    const rows = [match({ path: 'src/a.ts', line: 2, match: 'todo', start: 0, end: 4 })];
    expect(formatGrepResult(rows)).toBe('src/a.ts:2: todo');
    expect(formatGrepResult(rows, undefined)).toBe('src/a.ts:2: todo');
  });

  it('separates output lines with one newline and adds no final newline', () => {
    const rows = [
      match({ path: 'a.ts', line: 1, match: 'alpha', start: 0, end: 5 }),
      match({ path: 'b.ts', line: 3, match: 'beta', start: 0, end: 4 }),
    ];
    const output = formatGrepResult(rows, { kind: 'limit', limit: 2 });
    expect(output.split('\n')).toEqual(['a.ts:1: alpha', 'b.ts:3: beta', limitLine(2)]);
    expect(output.endsWith('\n')).toBe(false);
  });

  it('appends the limit trailer with the ending limit, not the row count', () => {
    const rows = [
      match({ path: 'a.ts', line: 1, match: 'alpha', start: 0, end: 5 }),
      match({ path: 'b.ts', line: 2, match: 'beta', start: 0, end: 4 }),
    ];
    expect(formatGrepResult(rows, { kind: 'limit', limit: 7 })).toBe(
      `a.ts:1: alpha\nb.ts:2: beta\n${limitLine(7)}`,
    );
    expect(formatGrepResult([], { kind: 'limit', limit: 7 })).toBe(`(no matches)\n${limitLine(7)}`);
  });

  it('appends the timeout trailer after rows or after the sentinel', () => {
    const rows = [match({ path: 'a.ts', line: 4, match: 'alpha', start: 0, end: 5 })];
    expect(formatGrepResult(rows, { kind: 'timeout' })).toBe(`a.ts:4: alpha\n${timeoutLine}`);
    expect(formatGrepResult([], { kind: 'timeout' })).toBe(`(no matches)\n${timeoutLine}`);
  });

  it('appends the slow trailer with the supplied path', () => {
    const rows = [match({ path: 'a.ts', line: 5, match: 'alpha', start: 0, end: 5 })];
    expect(formatGrepResult(rows, { kind: 'slow', path: 'src/slow.ts' })).toBe(
      `a.ts:5: alpha\n${slowLine('src/slow.ts')}`,
    );
    expect(formatGrepResult([], { kind: 'slow', path: 'src/slow.ts' })).toBe(
      `(no matches)\n${slowLine('src/slow.ts')}`,
    );
  });

  it('appends exactly one trailer line for every ending', () => {
    const endings: GrepEnding[] = [
      { kind: 'limit', limit: 3 },
      { kind: 'timeout' },
      { kind: 'slow', path: 'src/slow.ts' },
    ];
    for (const ending of endings) {
      expect(formatGrepResult([match()], ending).split('\n')).toHaveLength(2);
      expect(formatGrepResult([], ending).split('\n')).toHaveLength(2);
    }
  });
});

describe('previewLine', () => {
  it('keeps internal and trailing whitespace in a short line', () => {
    expect(previewLine('  foo  bar  ', 2, 5)).toBe('foo  bar  ');
  });

  it('shows a trimmed line of exactly 200 units whole', () => {
    const line = 'a'.repeat(200);
    expect(previewLine(line, 0, 1)).toBe(line);
  });

  it('cuts a 201-unit line with a trailing ellipsis', () => {
    expect(previewLine('a'.repeat(201), 0, 1)).toBe(`${'a'.repeat(200)}${ellipsis}`);
  });

  it('starts an early window at the line beginning', () => {
    const line = `MATCH${'x'.repeat(295)}`;
    expect(previewLine(line, 0, 5)).toBe(`MATCH${'x'.repeat(195)}${ellipsis}`);
  });

  it('centers a middle window with one spare unit after the match', () => {
    const line = `${'a'.repeat(150)}MATCH${'b'.repeat(245)}`;
    expect(previewLine(line, 150, 155)).toBe(`${ellipsis}${'a'.repeat(97)}MATCH${'b'.repeat(98)}${ellipsis}`);
  });

  it('shifts a late window back from the line end', () => {
    const line = `${'c'.repeat(300)}MATCH${'d'.repeat(95)}`;
    expect(previewLine(line, 300, 305)).toBe(`${ellipsis}${'c'.repeat(100)}MATCH${'d'.repeat(95)}`);
  });

  it('puts an odd spare unit after a centered match', () => {
    const line = `${'p'.repeat(140)}Q${'q'.repeat(159)}`;
    expect(previewLine(line, 140, 141)).toBe(`${ellipsis}${'p'.repeat(99)}Q${'q'.repeat(100)}${ellipsis}`);
  });

  it('shows a match exactly 200 units long whole', () => {
    const line = `${'a'.repeat(100)}${'M'.repeat(200)}${'b'.repeat(100)}`;
    expect(previewLine(line, 100, 300)).toBe(`${ellipsis}${'M'.repeat(200)}${ellipsis}`);
  });

  it('starts the window at a match longer than 200 units', () => {
    const line = `${'a'.repeat(50)}${'M'.repeat(250)}${'b'.repeat(50)}`;
    expect(previewLine(line, 50, 300)).toBe(`${ellipsis}${'M'.repeat(200)}${ellipsis}`);
  });

  it('uses the supplied first span when a line has several matches', () => {
    const line = `${'a'.repeat(250)}first${'b'.repeat(200)}second${'c'.repeat(100)}`;
    expect(previewLine(line, 250, 255)).toBe(`${ellipsis}${'a'.repeat(97)}first${'b'.repeat(98)}${ellipsis}`);
  });

  it('shifts the span past leading spaces and tabs', () => {
    const line = `    ${'a'.repeat(150)}MATCH${'a'.repeat(150)}`;
    expect(previewLine(line, 154, 159)).toBe(`${ellipsis}${'a'.repeat(97)}MATCH${'a'.repeat(98)}${ellipsis}`);
    expect(previewLine('\t\t  foo bar', 4, 7)).toBe('foo bar');
  });

  it('collapses a span partly inside the removed leading whitespace', () => {
    const line = `${' '.repeat(5)}ab${'c'.repeat(300)}`;
    expect(previewLine(line, 3, 7)).toBe(`ab${'c'.repeat(198)}${ellipsis}`);
  });

  it('collapses a span wholly inside the removed leading whitespace', () => {
    const line = `${' '.repeat(20)}${'x'.repeat(300)}`;
    expect(previewLine(line, 5, 10)).toBe(`${'x'.repeat(200)}${ellipsis}`);
  });

  it('returns an empty preview for an all-whitespace line', () => {
    expect(previewLine('   \t  ', 2, 4)).toBe('');
    expect(previewLine('  \r', 1, 3)).toBe('');
  });

  it('drops one trailing carriage return and clips the span to the new end', () => {
    expect(previewLine('abc\r', 2, 4)).toBe('abc');
    expect(previewLine(`${'a'.repeat(400)}\r`, 395, 401)).toBe(`${ellipsis}${'a'.repeat(200)}`);
  });

  it('drops only one final carriage return', () => {
    expect(previewLine('abc\r\r', 0, 5)).toBe('abc\r');
  });

  it('measures offsets and the window in UTF-16 code units', () => {
    const line = `😀${'a'.repeat(400)}`;
    expect(previewLine(line, 2, 3)).toBe(`😀${'a'.repeat(198)}${ellipsis}`);
  });
});
