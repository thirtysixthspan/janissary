import { describe, it, expect } from 'vitest';
import { isSyncedPath } from './sync-path-match.js';

describe('isSyncedPath', () => {
  it('matches an exact file path', () => {
    expect(isSyncedPath('docs/notes.md', ['docs/notes.md'])).toBe(true);
  });

  it('does not match a different exact file path', () => {
    expect(isSyncedPath('docs/notes2.md', ['docs/notes.md'])).toBe(false);
  });

  it('matches files under a trailing-slash directory prefix at any depth', () => {
    expect(isSyncedPath('product/backlog/bugs.md', ['product/backlog/'])).toBe(true);
    expect(isSyncedPath('product/backlog/sub/deep.md', ['product/backlog/'])).toBe(true);
  });

  it('does not match a sibling directory that merely shares a prefix', () => {
    expect(isSyncedPath('product/backlog2/bugs.md', ['product/backlog/'])).toBe(false);
  });

  it('matches a single-level wildcard only within one path segment', () => {
    expect(isSyncedPath('product/backlog/bugs.md', ['product/backlog/*'])).toBe(true);
    expect(isSyncedPath('product/backlog/sub/deep.md', ['product/backlog/*'])).toBe(false);
  });

  it('matches a two-level wildcard exactly two segments deep', () => {
    expect(isSyncedPath('product/plans/draft/foo.md', ['product/plans/*/*'])).toBe(true);
    expect(isSyncedPath('product/plans/foo.md', ['product/plans/*/*'])).toBe(false);
    expect(isSyncedPath('product/plans/draft/sub/foo.md', ['product/plans/*/*'])).toBe(false);
  });

  it('returns true if any pattern in the list matches', () => {
    expect(isSyncedPath('product/backlog/bugs.md', ['docs/notes.md', 'product/backlog/'])).toBe(true);
  });

  it('returns false if no pattern in the list matches', () => {
    expect(isSyncedPath('src/index.ts', ['docs/notes.md', 'product/backlog/'])).toBe(false);
  });
});
