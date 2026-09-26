import { describe, expect, it } from 'vitest';
import { firstSelectable, normalizeIndex, seekSelectable } from './sectioned-rows';

const header = { header: true };
const row = {};
// [#A, a1, a2, #B, b1]
const rows = [header, row, row, header, row];

describe('firstSelectable', () => {
  it('skips a leading section header', () => {
    expect(firstSelectable(rows)).toBe(1);
  });

  it('returns 0 for an empty list', () => {
    expect(firstSelectable([])).toBe(0);
  });

  it('returns 0 when every row is a header', () => {
    expect(firstSelectable([header, header])).toBe(0);
  });
});

describe('seekSelectable', () => {
  it('skips a header moving down', () => {
    expect(seekSelectable(rows, 2, 1)).toBe(4);
  });

  it('skips a header moving up', () => {
    expect(seekSelectable(rows, 4, -1)).toBe(2);
  });

  it('stays put at either edge', () => {
    expect(seekSelectable(rows, 1, -1)).toBe(1);
    expect(seekSelectable(rows, 4, 1)).toBe(4);
  });
});

describe('normalizeIndex', () => {
  it('leaves a selectable index alone', () => {
    expect(normalizeIndex(rows, 2)).toBe(2);
  });

  it('clamps an index past the end onto the last row', () => {
    expect(normalizeIndex(rows, 9)).toBe(4);
  });

  it('clamps a negative index onto the first selectable row', () => {
    expect(normalizeIndex(rows, -2)).toBe(1);
  });

  it('moves a header index forward to the row it introduces', () => {
    expect(normalizeIndex(rows, 3)).toBe(4);
  });

  it('falls back to the previous selectable row for a trailing header', () => {
    expect(normalizeIndex([header, row, header], 2)).toBe(1);
  });

  it('clamps past the end onto a trailing header, then back to the last selectable row', () => {
    expect(normalizeIndex([header, row, header], 5)).toBe(1);
  });

  it('returns 0 for an empty list or a list of headers alone', () => {
    expect(normalizeIndex([], 3)).toBe(0);
    expect(normalizeIndex([header, header], 1)).toBe(0);
  });
});
