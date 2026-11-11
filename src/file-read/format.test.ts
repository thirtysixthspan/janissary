import { describe, it, expect } from 'vitest';
import { FILE_READ_MAX_LIMIT, type FileReadArgs } from './command.js';
import { FILE_READ_MAX_LINE_LENGTH, formatFileLines } from './format.js';

function args(offset = 1, limit = FILE_READ_MAX_LIMIT, path = 'a.md'): FileReadArgs {
  return { path, offset, limit };
}

function numberedText(count: number): string {
  return Array.from({ length: count }, (_, index) => `line ${index + 1}`).join('\n');
}

const tenLines = numberedText(10);

describe('formatFileLines numbering and windows', () => {
  it('pads numbers to the width of the last line shown', () => {
    const output = formatFileLines(tenLines, args()).split('\n');
    expect(output).toHaveLength(10);
    expect(output[0]).toBe(' 1\tline 1');
    expect(output[8]).toBe(' 9\tline 9');
    expect(output[9]).toBe('10\tline 10');
  });

  it('does not pad a window that ends below the width boundary', () => {
    const output = formatFileLines(tenLines, args(1, 9)).split('\n');
    expect(output[0]).toBe('1\tline 1');
    expect(output[8]).toBe('9\tline 9');
    expect(output[9]).toBe('(showing lines 1-9 of 10; continue with --offset 10)');
  });

  it('shows a whole short file with the default window and no notice', () => {
    expect(formatFileLines('a\nb\nc', args())).toBe('1\ta\n2\tb\n3\tc');
  });

  it('shows an explicit offset and limit with a continuation notice', () => {
    expect(formatFileLines(tenLines, args(3, 2))).toBe(
      '3\tline 3\n4\tline 4\n(showing lines 3-4 of 10; continue with --offset 5)',
    );
  });

  it('shows one line and no notice at an offset of exactly the last line', () => {
    expect(formatFileLines(tenLines, args(10, 5))).toBe('10\tline 10');
  });

  it('caps the default window and points at the next line', () => {
    const output = formatFileLines(numberedText(FILE_READ_MAX_LIMIT + 1), args()).split('\n');
    expect(output).toHaveLength(FILE_READ_MAX_LIMIT + 1);
    expect(output[FILE_READ_MAX_LIMIT - 1]).toBe(`${FILE_READ_MAX_LIMIT}\tline ${FILE_READ_MAX_LIMIT}`);
    expect(output[FILE_READ_MAX_LIMIT]).toBe('(showing lines 1-2000 of 2001; continue with --offset 2001)');
  });

  it('has no notice when the window reaches the end', () => {
    const output = formatFileLines(numberedText(FILE_READ_MAX_LIMIT + 1), args(2)).split('\n');
    expect(output).toHaveLength(FILE_READ_MAX_LIMIT);
    expect(output.at(-1)).toBe(`${FILE_READ_MAX_LIMIT + 1}\tline ${FILE_READ_MAX_LIMIT + 1}`);
  });

  it('clamps a limit above the maximum', () => {
    const output = formatFileLines(numberedText(FILE_READ_MAX_LIMIT + 5), args(1, FILE_READ_MAX_LIMIT + 5)).split('\n');
    expect(output).toHaveLength(FILE_READ_MAX_LIMIT + 1);
    expect(output.at(-1)).toBe(
      `(showing lines 1-${FILE_READ_MAX_LIMIT} of ${FILE_READ_MAX_LIMIT + 5}; continue with --offset ${FILE_READ_MAX_LIMIT + 1})`,
    );
  });
});

describe('formatFileLines long lines', () => {
  it('cuts a line one character over the maximum', () => {
    const line = 'x'.repeat(FILE_READ_MAX_LINE_LENGTH + 1);
    expect(formatFileLines(line, args())).toBe(`1\t${'x'.repeat(FILE_READ_MAX_LINE_LENGTH)}…`);
  });

  it('leaves a line of exactly the maximum alone', () => {
    const line = 'x'.repeat(FILE_READ_MAX_LINE_LENGTH);
    expect(formatFileLines(line, args())).toBe(`1\t${line}`);
  });

  it('cuts astral characters by code point without leaving a lone surrogate', () => {
    const line = '😀'.repeat(FILE_READ_MAX_LINE_LENGTH + 1);
    const output = formatFileLines(line, args());
    expect(output).toBe(`1\t${'😀'.repeat(FILE_READ_MAX_LINE_LENGTH)}…`);
    expect(output.isWellFormed()).toBe(true);
  });

  it('leaves alone an astral line whose code points fit', () => {
    const line = '😀'.repeat(FILE_READ_MAX_LINE_LENGTH);
    expect(formatFileLines(line, args())).toBe(`1\t${line}`);
  });
});

describe('formatFileLines line splitting', () => {
  it('prints (empty file) for empty text at any offset', () => {
    expect(formatFileLines('', args())).toBe('(empty file)');
    expect(formatFileLines('', args(5))).toBe('(empty file)');
  });

  it('treats a lone newline as one empty line', () => {
    expect(formatFileLines('\n', args())).toBe('1\t');
  });

  it('does not count a final newline as an extra line', () => {
    expect(formatFileLines('a\nb\n', args())).toBe('1\ta\n2\tb');
    expect(formatFileLines('a\n\n', args())).toBe('1\ta\n2\t');
  });

  it('strips CRLF line endings', () => {
    expect(formatFileLines('a\r\nb\r\n', args())).toBe('1\ta\n2\tb');
  });

  it('counts a last line with no final newline', () => {
    expect(formatFileLines('a\nb', args(2))).toBe('2\tb');
  });

  it('keeps a lone carriage return inside a line', () => {
    expect(formatFileLines('a\rb\nc', args())).toBe('1\ta\rb\n2\tc');
  });
});

describe('formatFileLines offset past the end', () => {
  it('reports the total and the path as given', () => {
    expect(formatFileLines('a\nb\nc\n', args(4, FILE_READ_MAX_LIMIT, './notes/a.md'))).toBe(
      'Offset past end of file (3 lines): ./notes/a.md.',
    );
  });

  it('keeps the plural for a one-line file', () => {
    expect(formatFileLines('only', args(2))).toBe('Offset past end of file (1 lines): a.md.');
  });
});
