import { describe, expect, it } from 'vitest';
import { FILE_HEAD_TAIL_MAX_LINES, FILE_HEAD_USAGE, FILE_TAIL_USAGE, parseFileHeadTail } from './command.js';

describe('parseFileHeadTail', () => {
  it('parses head and tail with the default count of 10', () => {
    expect(parseFileHeadTail('file head a.md')).toEqual({ direction: 'head', path: 'a.md', count: 10 });
    expect(parseFileHeadTail('file tail notes/a.md')).toEqual({ direction: 'tail', path: 'notes/a.md', count: 10 });
  });

  it('parses an explicit single-dash count after the path', () => {
    expect(parseFileHeadTail('file head a.md -n 3')).toEqual({ direction: 'head', path: 'a.md', count: 3 });
    expect(parseFileHeadTail(`file tail a.md -n ${FILE_HEAD_TAIL_MAX_LINES}`)).toEqual({
      direction: 'tail',
      path: 'a.md',
      count: FILE_HEAD_TAIL_MAX_LINES,
    });
  });

  it('matches the keywords case-insensitively and keeps the path verbatim', () => {
    expect(parseFileHeadTail('FILE HEAD notes/A.md')).toEqual({ direction: 'head', path: 'notes/A.md', count: 10 });
    expect(parseFileHeadTail('file TAIL ./A.md -n 007')).toEqual({ direction: 'tail', path: './A.md', count: 7 });
  });

  it('tolerates surrounding and repeated whitespace including tabs', () => {
    expect(parseFileHeadTail('  file   head\ta.md  -n \t 4  ')).toEqual({ direction: 'head', path: 'a.md', count: 4 });
  });

  it('returns the head usage for a missing path or a malformed head line', () => {
    expect(parseFileHeadTail('file head')).toEqual({ error: FILE_HEAD_USAGE });
    expect(parseFileHeadTail('file head -n 5')).toEqual({ error: FILE_HEAD_USAGE });
    expect(parseFileHeadTail('file head a.md b.md')).toEqual({ error: FILE_HEAD_USAGE });
  });

  it('returns the tail usage for a missing path or a malformed tail line', () => {
    expect(parseFileHeadTail('file tail')).toEqual({ error: FILE_TAIL_USAGE });
    expect(parseFileHeadTail('file tail -n 5')).toEqual({ error: FILE_TAIL_USAGE });
    expect(parseFileHeadTail('file tail a.md b.md')).toEqual({ error: FILE_TAIL_USAGE });
  });

  it('returns the matching usage for a repeated -n', () => {
    expect(parseFileHeadTail('file head a.md -n 2 -n 3')).toEqual({ error: FILE_HEAD_USAGE });
    expect(parseFileHeadTail('file tail a.md -n 2 -n 3')).toEqual({ error: FILE_TAIL_USAGE });
  });

  it('returns the matching usage for zero, negative, non-numeric and oversized counts', () => {
    for (const count of ['0', '-3', 'abc', String(FILE_HEAD_TAIL_MAX_LINES + 1), '1.5', '1e3']) {
      expect(parseFileHeadTail(`file head a.md -n ${count}`)).toEqual({ error: FILE_HEAD_USAGE });
      expect(parseFileHeadTail(`file tail a.md -n ${count}`)).toEqual({ error: FILE_TAIL_USAGE });
    }
  });

  it('returns the matching usage for a -n with no value or an unknown flag', () => {
    expect(parseFileHeadTail('file head a.md -n')).toEqual({ error: FILE_HEAD_USAGE });
    expect(parseFileHeadTail('file tail a.md --limit 5')).toEqual({ error: FILE_TAIL_USAGE });
  });

  it('uses the canonical usage text for each subcommand', () => {
    expect(FILE_HEAD_USAGE).toBe('Usage: file head <path> [-n <lines>]');
    expect(FILE_TAIL_USAGE).toBe('Usage: file tail <path> [-n <lines>]');
  });
});
