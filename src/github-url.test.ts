import { describe, it, expect } from 'vitest';
import { githubCommitsUrl } from './github-url.js';

describe('githubCommitsUrl', () => {
  it('builds the commits url for an https origin', () => {
    expect(githubCommitsUrl('https://github.com/owner/repo.git', 'main')).toBe('https://github.com/owner/repo/commits/main/');
  });

  it('builds the commits url for an scp-style ssh origin', () => {
    expect(githubCommitsUrl('git@github.com:owner/repo.git', 'master')).toBe('https://github.com/owner/repo/commits/master/');
  });

  it('returns undefined for a non-github host', () => {
    expect(githubCommitsUrl('git@gitlab.com:owner/repo.git', 'main')).toBeUndefined();
  });

  it('returns undefined for a malformed remote', () => {
    expect(githubCommitsUrl('not a url', 'main')).toBeUndefined();
  });
});
