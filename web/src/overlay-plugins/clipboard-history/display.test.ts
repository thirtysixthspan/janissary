import { describe, expect, it } from 'vitest';
import { displayLine } from './display';

// The popup shows one line per entry: the first line of *non-space* text. Two cases make that
// different from "the first line", and both are what a copy taken from the middle of an indented
// block or from output that opens with blank lines actually looks like.

describe('displayLine', () => {
  it('reads a single line of text as itself, with no postfix', () => {
    expect(displayLine('hello')).toEqual({ label: 'hello', postfix: '' });
  });

  it('strips leading whitespace across newlines before taking the first line', () => {
    expect(displayLine('\n\n    indented first line').label).toBe('indented first line');
  });

  it('postfixes the line count when the copy had more than one line, rather than an ellipsis', () => {
    expect(displayLine('first\nsecond\nthird')).toEqual({ label: 'first', postfix: '(3 lines)' });
  });

  it('does not count a trailing newline as another line', () => {
    // A copy of one line that happens to end in a newline reads as that one line. Calling it two lines
    // would describe text the user cannot see in it.
    expect(displayLine('only line\n')).toEqual({ label: 'only line', postfix: '' });
  });

  it('does not count the blank lines a copy opens with', () => {
    expect(displayLine('\n\n  first\nsecond')).toEqual({ label: 'first', postfix: '(2 lines)' });
  });

  it('leaves the full text alone, so what is pasted is never the display line', () => {
    const text = '   keep\tthis\nexactly';
    expect(displayLine(text)).toEqual({ label: 'keep\tthis', postfix: '(2 lines)' });
  });

  it('reads an empty copy as an empty line with nothing more', () => {
    expect(displayLine('')).toEqual({ label: '', postfix: '' });
  });

  it('reads a whitespace-only copy as an empty line too, since nothing precedes the first line', () => {
    // Every character here is leading whitespace, so there is no first line to read and nothing to
    // count. Such a copy is never recorded anyway.
    expect(displayLine('  \n \n')).toEqual({ label: '', postfix: '' });
  });
});
