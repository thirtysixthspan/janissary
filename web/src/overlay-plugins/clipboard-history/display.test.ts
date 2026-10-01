import { describe, expect, it } from 'vitest';
import { displayLine } from './display';

// The popup shows one line per entry: the first line of *non-space* text. Two cases make that
// different from "the first line", and both are what a copy taken from the middle of an indented
// block or from output that opens with blank lines actually looks like.

describe('displayLine', () => {
  it('reads a single line of text as itself', () => {
    expect(displayLine('hello')).toEqual({ label: 'hello', truncated: false });
  });

  it('strips leading whitespace across newlines before taking the first line', () => {
    expect(displayLine('\n\n    indented first line').label).toBe('indented first line');
  });

  it('marks an ellipsis when the copy had more than one line', () => {
    expect(displayLine('first\nsecond\nthird')).toEqual({ label: 'first…', truncated: true });
  });

  it('marks an ellipsis when the rest of the copy is only trailing whitespace on later lines', () => {
    // The stored text is the thing that matters, not its appearance: a copy of one line that happens
    // to end in a newline is still more than the one line shown.
    expect(displayLine('only line\n')).toEqual({ label: 'only line…', truncated: true });
  });

  it('leaves the full text alone, so what is pasted is never the display line', () => {
    const text = '   keep\tthis\nexactly';
    expect(displayLine(text).label).toBe('keep\tthis…');
  });

  it('reads an empty copy as an empty line with nothing more', () => {
    expect(displayLine('')).toEqual({ label: '', truncated: false });
  });

  it('reads a whitespace-only copy as an empty line too, since nothing precedes the first line', () => {
    // Every character here is leading whitespace, so there is no first line to read and nothing to
    // mark as missing. Such a copy is never recorded anyway.
    expect(displayLine('  \n \n')).toEqual({ label: '', truncated: false });
  });
});
