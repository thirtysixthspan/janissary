import { describe, it, expect } from 'vitest';
import { githubTokenNotice, workspaceReadyNotice } from './serve-notice.js';

describe('githubTokenNotice', () => {
  it('says nothing when the forwarded token is the one in use', () => {
    expect(githubTokenNotice('github_pat_forwarded', undefined)).toBeUndefined();
  });

  // The forwarded token wins over the remote's own, so this case is silent too.
  it('says nothing when a forwarded token arrives alongside the remote\'s own', () => {
    expect(githubTokenNotice('github_pat_forwarded', 'github_pat_remote')).toBeUndefined();
  });

  it('names the fallback when nothing was forwarded but the remote has its own token', () => {
    expect(githubTokenNotice(undefined, 'github_pat_remote')).toContain('github token:');
    expect(githubTokenNotice(undefined, 'github_pat_remote')).toContain('this machine\'s own');
  });

  it('reports that nothing was injected when neither machine has a token', () => {
    const notice = githubTokenNotice(undefined, undefined);
    expect(notice).toContain('github token:');
    expect(notice).toContain('none was injected');
  });

  // The join is on `; `, so a semicolon inside a notice would read as a notice of its own.
  it('never puts a semicolon inside a notice', () => {
    expect(githubTokenNotice(undefined, 'github_pat_remote')).not.toContain(';');
    expect(githubTokenNotice(undefined, undefined)).not.toContain(';');
  });
});

describe('workspaceReadyNotice', () => {
  it('joins the notices that are present', () => {
    expect(workspaceReadyNotice('workspace isolation off: sandbox-exec unavailable', 'github token: none'))
      .toBe('workspace isolation off: sandbox-exec unavailable; github token: none');
  });

  it('passes a single present notice through unchanged', () => {
    expect(workspaceReadyNotice(undefined, 'github token: none')).toBe('github token: none');
  });

  it('is undefined when there is nothing to say, so the tab appends no line', () => {
    expect(workspaceReadyNotice(undefined, undefined)).toBeUndefined();
  });
});
