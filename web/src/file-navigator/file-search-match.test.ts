import { describe, it, expect } from 'vitest';
import { bestFileMatch, ghostSuffix } from './file-search-match';

describe('bestFileMatch', () => {
  it('matches the basename case-insensitively', () => {
    expect(bestFileMatch(['src/App.tsx'], 'app')).toBe('src/App.tsx');
  });

  it('ranks a filename-prefix match before a mid-string substring match', () => {
    const paths = ['src/xApp.ts', 'src/App.ts'];
    expect(bestFileMatch(paths, 'app')).toBe('src/App.ts');
  });

  it('breaks a tie between two prefix matches by the shorter path', () => {
    const paths = ['a/deeper/App.ts', 'a/App.ts'];
    expect(bestFileMatch(paths, 'app')).toBe('a/App.ts');
  });

  it('breaks a tie between equal-length paths by localeCompare', () => {
    const paths = ['b/App.ts', 'a/App.ts'];
    expect(bestFileMatch(paths, 'app')).toBe('a/App.ts');
  });

  it('returns undefined for an empty query', () => {
    expect(bestFileMatch(['a.ts'], '')).toBeUndefined();
    expect(bestFileMatch(['a.ts'], ' '.repeat(3))).toBeUndefined();
  });

  it('returns undefined when nothing matches', () => {
    expect(bestFileMatch(['a.ts', 'b.ts'], 'zzz')).toBeUndefined();
  });

  it('never matches a directory-only substring, only the basename', () => {
    expect(bestFileMatch(['app/other.ts'], 'app')).toBeUndefined();
  });
});

describe('ghostSuffix', () => {
  it('returns the filename remainder when the basename starts with the query', () => {
    expect(ghostSuffix('src/App.tsx', 'App')).toBe('.tsx');
  });

  it('is case-insensitive', () => {
    expect(ghostSuffix('src/App.tsx', 'app')).toBe('.tsx');
  });

  it('returns undefined for a mid-string substring match', () => {
    expect(ghostSuffix('src/xApp.tsx', 'App')).toBeUndefined();
  });

  it('returns undefined for an empty query', () => {
    expect(ghostSuffix('src/App.tsx', '')).toBeUndefined();
  });
});
