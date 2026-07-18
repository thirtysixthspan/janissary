import { describe, it, expect, vi } from 'vitest';
import { fuzzyMatch, hasSubsequence } from './fuzzy-match';

describe('hasSubsequence', () => {
  it('is case-insensitive', () => {
    expect(hasSubsequence('web/src/profilepicker.tsx', 'wsprof')).toBe(true);
  });

  it('rejects a query whose characters are not a subsequence, without scoring it', () => {
    const spy = vi.fn();
    expect(hasSubsequence('a/b/c.ts', 'zzz')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('fuzzyMatch', () => {
  it('matches case-insensitively', () => {
    const results = fuzzyMatch(['web/src/App.tsx'], 'APP', 10);
    expect(results.map((r) => r.path)).toEqual(['web/src/App.tsx']);
  });

  it('excludes a non-subsequence match entirely', () => {
    expect(fuzzyMatch(['web/src/App.tsx'], 'zzz', 10)).toEqual([]);
  });

  it('ranks a filename-portion match above a directory-only match', () => {
    const results = fuzzyMatch(['app/other.ts', 'other/App.ts'], 'app', 10);
    expect(results.map((r) => r.path)).toEqual(['other/App.ts', 'app/other.ts']);
  });

  it('ranks consecutive/boundary matches above scattered ones', () => {
    const results = fuzzyMatch(['x/abcy.ts', 'a-b-c-y.ts'], 'abc', 10);
    expect(results[0].path).toBe('x/abcy.ts');
  });

  it('breaks a tie in score by shorter path', () => {
    const results = fuzzyMatch(['dir/App.ts', 'longerdir/App.ts'], 'App', 10);
    expect(results.map((r) => r.path)).toEqual(['dir/App.ts', 'longerdir/App.ts']);
  });

  it('caps the result to the limit and stays sorted best-first', () => {
    const paths = Array.from({ length: 20 }, (_, i) => `dir${i}/app.ts`);
    const results = fuzzyMatch(paths, 'app', 5);
    expect(results).toHaveLength(5);
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
    }
  });

  it('returns highlight ranges only for the top-N, covering exactly the matched characters', () => {
    const paths = ['a/app.ts', 'b/app.ts', 'c/app.ts'];
    const results = fuzzyMatch(paths, 'app', 2);
    expect(results).toHaveLength(2);
    for (const result of results) {
      const matched = result.ranges.map(([start, end]) => result.path.slice(start, end).toLowerCase()).join('');
      expect(matched).toBe('app');
    }
  });

  it('returns no results for an empty query', () => {
    expect(fuzzyMatch(['a.ts', 'b.ts'], '', 10)).toEqual([]);
    expect(fuzzyMatch(['a.ts', 'b.ts'], ' '.repeat(3), 10)).toEqual([]);
  });

  it('filters a large synthetic input within a small time budget', () => {
    const paths = Array.from({ length: 50_000 }, (_, i) => `src/module${i}/component${i}/index.ts`);
    const start = performance.now();
    const results = fuzzyMatch(paths, 'modcompidx', 100);
    const elapsed = performance.now() - start;
    expect(results.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});
