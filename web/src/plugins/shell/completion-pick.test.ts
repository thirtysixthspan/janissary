import { describe, expect, it } from 'vitest';
import { completionPickLine } from './completion-pick';

describe('completionPickLine', () => {
  it('puts a bare entry name after the directory the token already holds', () => {
    expect(completionPickLine('cat src/foo.', 12, 'foo.test.ts')).toEqual({ line: 'cat src/foo.test.ts', cursor: 19 });
  });

  it('replaces the whole token with a match that carries it', () => {
    expect(completionPickLine('files src/c', 11, 'src/components/')).toEqual({ line: 'files src/components/', cursor: 21 });
  });

  it('quotes an unquoted partial when the pick is quoted', () => {
    expect(completionPickLine('tab close my', 12, '"my tab"')).toEqual({ line: 'tab close "my tab"', cursor: 18 });
  });

  it('completes a partial that is already quoted', () => {
    expect(completionPickLine('tab close "my t', 15, '"my tab"')).toEqual({ line: 'tab close "my tab"', cursor: 18 });
  });

  it('keeps the text after the cursor', () => {
    expect(completionPickLine('cat do | wc', 6, 'docs')).toEqual({ line: 'cat docs | wc', cursor: 8 });
  });

  it('inserts the pick at the cursor when nothing before it overlaps', () => {
    expect(completionPickLine('ls ', 3, 'beta')).toEqual({ line: 'ls beta', cursor: 7 });
  });
});
