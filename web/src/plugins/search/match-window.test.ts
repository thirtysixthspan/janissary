import { describe, expect, it } from 'vitest';
import { displayLineCount, displayLineOf, matchWindow, splitAtMatch } from './match-window';

describe('matchWindow', () => {
  it('leaves a match line that fits on one display line its full context either side', () => {
    expect(matchWindow(0, 1)).toEqual({ first: 0, count: 1, above: 2, below: 2 });
  });

  it('shows the start of a long line, and only the context above it, for a match on its first display line', () => {
    expect(matchWindow(0, 20)).toEqual({ first: 0, count: 3, above: 2, below: 0 });
  });

  it('shows the five display lines around a match deep inside a long line, and no context at all', () => {
    expect(matchWindow(10, 20)).toEqual({ first: 8, count: 5, above: 0, below: 0 });
  });

  it('shows the end of a long line, and only the context below it, for a match on its last display line', () => {
    expect(matchWindow(19, 20)).toEqual({ first: 17, count: 3, above: 0, below: 2 });
  });

  it('splits the difference when the match line supplies one display line on each side', () => {
    expect(matchWindow(1, 3)).toEqual({ first: 0, count: 3, above: 1, below: 1 });
  });

  it('keeps a match line it measured out of range inside the line', () => {
    expect(matchWindow(25, 20)).toEqual(matchWindow(19, 20));
    expect(matchWindow(-1, 20)).toEqual(matchWindow(0, 20));
  });
});

describe('displayLineCount', () => {
  it('rounds a measured height to whole display lines', () => {
    expect(displayLineCount(360, 18)).toBe(20);
    expect(displayLineCount(359.6, 18)).toBe(20);
  });

  it('never counts fewer than one', () => {
    expect(displayLineCount(0, 18)).toBe(1);
  });
});

describe('displayLineOf', () => {
  it('floors an offset to the display line it falls on', () => {
    expect(displayLineOf(0, 18)).toBe(0);
    expect(displayLineOf(2.5, 18)).toBe(0);
    expect(displayLineOf(182.5, 18)).toBe(10);
  });

  it('never answers a line above the first', () => {
    expect(displayLineOf(-3, 18)).toBe(0);
  });
});

describe('splitAtMatch', () => {
  it('cuts a line into the text before the match, the match, and the text after', () => {
    expect(splitAtMatch('  // todo: fix', 5, 9)).toEqual(['  // ', 'todo', ': fix']);
  });

  it('clamps offsets that do not fit the line, so all of its text still renders', () => {
    expect(splitAtMatch('abc', 5, 9)).toEqual(['abc', '', '']);
    expect(splitAtMatch('abc', -2, 1)).toEqual(['', 'a', 'bc']);
    expect(splitAtMatch('abc', 2, 1)).toEqual(['ab', '', 'c']);
  });
});
