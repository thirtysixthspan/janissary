import { describe, expect, it } from 'vitest';
import { parseHunks } from './parse-hunks.js';

function parse(...lines: string[]) {
  return parseHunks(lines.map((text, index) => ({ line: index + 1, text })));
}

describe('parseHunks', () => {
  it('parses consecutive hunks and preserves whitespace and end-of-file', () => {
    expect(parse('@@ foo  ', '  context \t', '-\told ', '+', '*** End of File', '@@', '+new')).toEqual({ hunks: [
      { anchor: 'foo  ', lines: [
        { kind: 'context', text: ' context \t' }, { kind: 'remove', text: '\told ' }, { kind: 'add', text: '' },
      ], endOfFile: true },
      { lines: [{ kind: 'add', text: 'new' }], endOfFile: false },
    ] });
  });

  it.each([['@@ ', undefined], ['@@@', '@'], ['@@  foo', ' foo'], ['@@ -1,3 +1,3 @@', '-1,3 +1,3 @@']])(
    'reads header %j as anchor %j', (header, anchor) => {
      expect(parse(header, '+x')).toEqual({ hunks: [{ ...(anchor && { anchor }), lines: [{ kind: 'add', text: 'x' }], endOfFile: false }] });
    },
  );

  it('accepts an implicit first hunk and keeps empty prefixed lines', () => {
    expect(parse(' ', '-', '+')).toEqual({ hunks: [{ lines: [
      { kind: 'context', text: '' }, { kind: 'remove', text: '' }, { kind: 'add', text: '' },
    ], endOfFile: false }] });
  });

  it.each([
    [['@@', 'bad'], 2], [['@@', ''], 2], [['@@', String.raw`\ No newline at end of file`], 2],
    [['*** End of File'], 1], [['+x', '*** End of File', '*** End of File'], 3],
    [['@@', '@@'], 2], [['@@', '*** End of File'], 2],
    [['+x', '*** End of File', ' x'], 3], [['@@'], 1],
  ])('rejects invalid body %j at line %i', (lines, line) => {
    expect(parse(...lines)).toEqual({ error: { line, problem: 'hunk lines must start with " ", "-", or "+"' } });
  });

  it('reports the terminating line for a dangling header', () => {
    expect(parseHunks([{ line: 4, text: '@@' }], 5)).toEqual({ error: {
      line: 5, problem: 'hunk lines must start with " ", "-", or "+"',
    } });
  });
});
