import { describe, it, expect, beforeEach, vi } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadGitIdentity, setGitIdentity, getGitIdentity, gitIdentityEnv } from './git-identity.js';

// Point git's global and system config at an empty file for every git process this suite starts —
// its own and the module's alike. Without it, "only one half configured" is a claim about the
// machine running the suite rather than about the repository under test.
beforeEach(() => {
  vi.stubEnv('GIT_CONFIG_GLOBAL', '/dev/null');
  vi.stubEnv('GIT_CONFIG_SYSTEM', '/dev/null');
  return () => { vi.unstubAllEnvs(); };
});

// A repository with its own local identity, so the read is pinned to what this directory resolves
// rather than to whatever the machine running the suite has configured globally.
function repo(name?: string, email?: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'git-identity-'));
  execFileSync('git', ['init'], { cwd: dir, stdio: 'pipe' });
  if (name !== undefined) execFileSync('git', ['config', 'user.name', name], { cwd: dir, stdio: 'pipe' });
  if (email !== undefined) execFileSync('git', ['config', 'user.email', email], { cwd: dir, stdio: 'pipe' });
  return dir;
}

describe('loadGitIdentity', () => {
  it('reads the name and email git resolves for the project directory', () => {
    const dir = repo('Ada Lovelace', 'ada@example.com');
    expect(loadGitIdentity(dir)).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' });
  });

  it('exposes the loaded identity through getGitIdentity', () => {
    const dir = repo('Ada Lovelace', 'ada@example.com');
    loadGitIdentity(dir);
    expect(getGitIdentity()).toEqual({ name: 'Ada Lovelace', email: 'ada@example.com' });
  });

  it('keeps the half it has when only one is configured', () => {
    const dir = repo('Ada Lovelace');
    expect(loadGitIdentity(dir)).toEqual({ name: 'Ada Lovelace' });
  });

  // Not an error state: a machine only has to have an identity by the time something commits.
  it('returns an empty record when git has no identity for the directory', () => {
    expect(loadGitIdentity(repo())).toEqual({});
  });

  // Loading a second project must not leave the first one's identity behind, the same way
  // `loadProjectTokens` replaces its record rather than merging into it.
  it('replaces the cache on a second load rather than merging into it', () => {
    loadGitIdentity(repo('Ada Lovelace', 'ada@example.com'));
    const second = repo('Grace Hopper');
    expect(loadGitIdentity(second)).toEqual({ name: 'Grace Hopper' });
    expect(getGitIdentity()).toEqual({ name: 'Grace Hopper' });
  });
});

describe('setGitIdentity', () => {
  it('replaces the cache outright, so no half of a previous identity survives', () => {
    loadGitIdentity(repo('Ada Lovelace', 'ada@example.com'));
    setGitIdentity({ name: 'Grace Hopper' });
    expect(getGitIdentity()).toEqual({ name: 'Grace Hopper' });
  });
});

describe('gitIdentityEnv', () => {
  it('sets both the author and the committer pair from a full identity', () => {
    expect(gitIdentityEnv({ name: 'Ada Lovelace', email: 'ada@example.com' })).toEqual({
      GIT_AUTHOR_NAME: 'Ada Lovelace',
      GIT_COMMITTER_NAME: 'Ada Lovelace',
      GIT_AUTHOR_EMAIL: 'ada@example.com',
      GIT_COMMITTER_EMAIL: 'ada@example.com',
    });
  });

  // An empty `GIT_AUTHOR_NAME` is not the same as an absent one — git reads the former as a name.
  it('plants no variable for a half the identity does not have', () => {
    expect(gitIdentityEnv({ email: 'ada@example.com' })).toEqual({
      GIT_AUTHOR_EMAIL: 'ada@example.com',
      GIT_COMMITTER_EMAIL: 'ada@example.com',
    });
  });

  it('returns an empty record for an empty identity', () => {
    expect(gitIdentityEnv({})).toEqual({});
  });
});
