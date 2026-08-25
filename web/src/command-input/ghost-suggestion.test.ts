import { describe, expect, it } from 'vitest';
import { findGhostSuggestion } from './ghost-suggestion';

describe('findGhostSuggestion', () => {
  it('returns the most recent matching entry, not the longest or oldest', () => {
    const history = ['git log', 'git status'];
    expect(findGhostSuggestion(history, 'git')).toBe('git status');
  });

  it('returns undefined for empty input', () => {
    expect(findGhostSuggestion(['git status'], '')).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(findGhostSuggestion(['ls', 'cd /tmp'], 'git')).toBeUndefined();
  });

  it('returns undefined for an exact match with nothing to extend', () => {
    expect(findGhostSuggestion(['ls'], 'ls')).toBeUndefined();
  });

  it('is case-sensitive', () => {
    expect(findGhostSuggestion(['Git status'], 'git')).toBeUndefined();
  });

  it('is anchored at the start', () => {
    expect(findGhostSuggestion(['agent foo'], 'gent')).toBeUndefined();
  });
});
