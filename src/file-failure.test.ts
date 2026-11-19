import { describe, expect, it } from 'vitest';
import { fileFailureLine } from './file-failure.js';

describe('fileFailureLine', () => {
  it('maps a missing path to missing', () => {
    expect(fileFailureLine('File not found', 'a.md')).toBe('missing');
  });

  it('maps a directory target to notdir', () => {
    expect(fileFailureLine('Is a directory', 'a.md')).toBe('notdir');
  });

  it('maps workspace and secret refusals to forbidden without echoing the path', () => {
    expect(fileFailureLine('Outside the workspace', '../a.md')).toBe('forbidden');
    expect(fileFailureLine('Secret file', '.env')).toBe('forbidden');
  });

  it('keeps the existing verbose lines for file-content failures', () => {
    expect(fileFailureLine('Not a text file', 'a.bin')).toBe('Not a text file: a.bin.');
    expect(fileFailureLine('File too large (>5 MB)', 'a.iso')).toBe('File too large (>5 MB): a.iso.');
  });

  it('returns nothing for no failure or the mutation-only protected file', () => {
    expect(fileFailureLine(undefined, 'a.md')).toBeUndefined();
    expect(fileFailureLine('Protected file', '.git/config')).toBeUndefined();
  });
});
