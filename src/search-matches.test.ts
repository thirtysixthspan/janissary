import { describe, it, expect } from 'vitest';
import { compilePattern, findMatches, matchRange } from './search-matches.js';
import type { BufferLine } from './types.js';

function line(text: string, type: BufferLine['type'] = 'output'): BufferLine {
  return { type, text };
}

describe('compilePattern', () => {
  it('returns null for an empty pattern', () => {
    expect(compilePattern('')).toBeNull();
  });

  it('returns null for an invalid regex', () => {
    expect(compilePattern('[')).toBeNull();
  });

  it('compiles a valid pattern case-insensitively', () => {
    const regex = compilePattern('error');
    expect(regex).not.toBeNull();
    expect(regex!.test('AN ERROR OCCURRED')).toBe(true);
  });
});

describe('findMatches', () => {
  it('finds matches in oldest-first order', () => {
    const lines = [line('first error'), line('all good'), line('second error')];
    expect(findMatches(lines, 'error')).toEqual([0, 2]);
  });

  it('returns an empty array for an empty pattern', () => {
    const lines = [line('anything')];
    expect(findMatches(lines, '')).toEqual([]);
  });

  it('returns an empty array for an invalid regex', () => {
    const lines = [line('anything')];
    expect(findMatches(lines, '[')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    const lines = [line('AN ERROR')];
    expect(findMatches(lines, 'error')).toEqual([0]);
  });

  it('skips terminal and spacer lines', () => {
    const lines = [line('error', 'terminal'), line('error', 'spacer'), line('error', 'output')];
    expect(findMatches(lines, 'error')).toEqual([2]);
  });
});

describe('matchRange', () => {
  it('returns the matched substring range', () => {
    expect(matchRange('an error occurred', 'error')).toEqual({ start: 3, end: 8 });
  });

  it('returns null when there is no match', () => {
    expect(matchRange('all good', 'error')).toBeNull();
  });

  it('returns null for an empty or invalid pattern', () => {
    expect(matchRange('anything', '')).toBeNull();
    expect(matchRange('anything', '[')).toBeNull();
  });
});
