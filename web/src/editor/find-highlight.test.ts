import { describe, it, expect } from 'vitest';
import { findMatchHighlight } from './find-highlight';
import type { FuzzyMatchResult } from '../shared/fuzzy-match';

const results: FuzzyMatchResult[] = [
  { path: 'alpha beta', index: 2, score: 5, ranges: [[6, 10]] },
  { path: 'beta gamma', index: 7, score: 4, ranges: [[0, 4]] },
];

describe('findMatchHighlight', () => {
  it("returns the highlighted result's line and matched range while the cursor is on it", () => {
    expect(findMatchHighlight({ findOpen: true, results, selected: 0 }, 2)).toEqual({ line: 2, from: 6, to: 10 });
  });

  it("follows the selected row rather than the first result", () => {
    expect(findMatchHighlight({ findOpen: true, results, selected: 1 }, 7)).toEqual({ line: 7, from: 0, to: 4 });
  });

  it('returns null while the overlay is closed', () => {
    expect(findMatchHighlight({ findOpen: false, results, selected: 0 }, 2)).toBeNull();
  });

  it('returns null when there are no results', () => {
    expect(findMatchHighlight({ findOpen: true, results: [], selected: 0 }, 2)).toBeNull();
  });

  it("returns null while the cursor is on another line than the highlighted result's", () => {
    expect(findMatchHighlight({ findOpen: true, results, selected: 0 }, 0)).toBeNull();
    expect(findMatchHighlight({ findOpen: true, results, selected: 0 }, undefined)).toBeNull();
  });
});
