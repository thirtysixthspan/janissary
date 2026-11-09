import { describe, expect, it } from 'vitest';
import { atFormBoundary, matchesCommandRow, normalizeCommandName, rankCommandRows } from './command-matching.js';

const row = (name: string, forms: readonly string[], aliases: readonly string[] = []) => ({ name, aliases, forms });

describe('normalizeCommandName', () => {
  it('trims, collapses whitespace and lowercases', () => {
    expect(normalizeCommandName('  Tab   FOCUS ')).toBe('tab focus');
  });
});

describe('atFormBoundary', () => {
  it('matches whole words only', () => {
    expect(atFormBoundary('ask reset', 'ask')).toBe(true);
    expect(atFormBoundary('ask', 'ask')).toBe(true);
    expect(atFormBoundary('asking', 'ask')).toBe(false);
  });
});

describe('matchesCommandRow', () => {
  it('matches through an alias', () => {
    expect(matchesCommandRow(row('close', ['close'], ['exit']), 'exit now')).toBe(true);
  });
});

describe('rankCommandRows', () => {
  it('prefers the longest matching form', () => {
    const ask = row('ask', ['ask']);
    const reset = row('ask', ['ask reset']);
    expect(rankCommandRows([ask, reset], 'ask reset')[0]).toBe(reset);
  });

  it('prefers the canonical form on a length tie', () => {
    const plugin = row('search', ['search']);
    const builtin = row('search', ['search transcript']);
    expect(rankCommandRows([builtin, plugin], 'search foo')[0]).toBe(plugin);
  });

  it('drops rows that do not match', () => {
    expect(rankCommandRows([row('quit', ['quit'])], 'theme')).toEqual([]);
  });
});
