import { describe, it, expect } from 'vitest';
import { truncateTabLabel } from './tab-label';

// A tab label that is too long has to be shortened without ever exceeding the width the strip gave
// it. The budget counts the ellipsis, which is the one thing easy to get wrong: slicing to
// `maxLength` and then appending `…` produces a label one character wider than the space it was
// given, and the ellipsis is what pushes it over.

describe('truncateTabLabel', () => {
  it('leaves a label that already fits alone', () => {
    expect(truncateTabLabel('notes', 5)).toBe('notes');
    expect(truncateTabLabel('notes', 50)).toBe('notes');
  });

  it('shortens a label that does not, counting the ellipsis in the budget', () => {
    const result = truncateTabLabel('a-very-long-tab-label', 10);

    expect(result).toBe('a-very-lo…');
    expect([...result]).toHaveLength(10);
  });

  it('never returns more characters than it was given, at any budget', () => {
    for (let budget = 0; budget <= 12; budget++) {
      expect([...truncateTabLabel('a-very-long-tab-label', budget)].length).toBeLessThanOrEqual(budget);
    }
  });

  it('returns nothing for a budget of zero rather than an ellipsis alone', () => {
    expect(truncateTabLabel('notes', 0)).toBe('');
    expect(truncateTabLabel('a', 0)).toBe('');
  });

  it('returns the ellipsis alone for a budget of one, since there is no room for text', () => {
    expect(truncateTabLabel('notes', 1)).toBe('…');
  });

  it('handles a label of exactly one character over the budget', () => {
    expect(truncateTabLabel('notes', 4)).toBe('not…');
  });

  it('counts by character, not by byte', () => {
    // A byte-length slice would cut a multi-byte name in half and leave a replacement character.
    expect(truncateTabLabel('héllo wörld', 8)).toBe('héllo w…');
  });
});
