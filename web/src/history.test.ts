import { describe, expect, it } from 'vitest';
import { getRecentHistory } from './history';

describe('getRecentHistory', () => {
  it('returns the most recent unique entries, oldest-first', () => {
    // Walking newest→oldest: 'git status'(3), 'ls'(2), 'cd /tmp'(1), 'ls'(0 skip).
    // Reversed for display: ['cd /tmp', 'ls', 'git status'].
    const history = ['ls', 'cd /tmp', 'ls', 'git status'];
    expect(getRecentHistory(history, 10)).toEqual(['cd /tmp', 'ls', 'git status']);
  });

  it('caps results at count', () => {
    const history = ['a', 'b', 'c', 'd', 'e'];
    expect(getRecentHistory(history, 3)).toEqual(['c', 'd', 'e']);
  });

  it('returns an empty array for empty history', () => {
    expect(getRecentHistory([], 10)).toEqual([]);
  });

  it('deduplicates keeping the most recent occurrence', () => {
    // 'a' appears at index 0 and index 2 — the most recent (index 2) wins.
    // Walking newest→oldest: index 2 = 'a' (kept), index 1 = 'b' (kept), index 0 = 'a' (skipped).
    // Reversed for display: ['b', 'a'].
    const history = ['a', 'b', 'a'];
    expect(getRecentHistory(history, 10)).toEqual(['b', 'a']);
  });

  it('handles count larger than unique entries', () => {
    const history = ['x', 'y'];
    expect(getRecentHistory(history, 100)).toEqual(['x', 'y']);
  });
});
