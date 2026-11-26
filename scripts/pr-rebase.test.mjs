import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitFiles, createRepo, git, gitEnv } from './git-fixture.mjs';
import { scriptPath } from './script-path.mjs';

const prRebase = scriptPath('pr-rebase.sh');

// A clone with `origin` pointing at a scratch bare remote. Its `feature` branch commits `files` and
// sits one commit behind the remote's `master`, so the rebase has real work to do. `npm` on PATH
// is a stub that prints its arguments and fails, so any check that reaches npm is visible and red.
function createClone(root, files) {
  const remote = path.join(root, 'remote.git');
  git(root, ['init', '--quiet', '--bare', '--initial-branch=master', remote]);
  const clone = createRepo('pr-rebase-clone-');
  git(clone, ['remote', 'add', 'origin', remote]);
  git(clone, ['push', '--quiet', 'origin', 'master']);
  git(clone, ['checkout', '--quiet', '-b', 'feature']);
  commitFiles(clone, files, 'feat: branch change');
  git(clone, ['checkout', '--quiet', 'master']);
  commitFiles(clone, ['upstream.md'], 'docs: upstream change');
  git(clone, ['push', '--quiet', 'origin', 'master']);
  git(clone, ['checkout', '--quiet', 'feature']);
  return { clone, remote };
}

function run(root, clone, args) {
  const bin = path.join(root, 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\necho "fake npm $*"\nexit 1\n');
  chmodSync(path.join(bin, 'npm'), 0o755);
  const env = { ...gitEnv, PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}` };
  return spawnSync('bash', [prRebase, ...args], { cwd: clone, env, encoding: 'utf8', timeout: 60_000 });
}

const remoteHasFeature = (remote) => git(remote, ['branch', '--list', 'feature']).trim() !== '';

describe('pr-rebase.sh', () => {
  let root;
  let clone;

  beforeEach(() => {
    root = mkdtempSync(path.join(os.tmpdir(), 'pr-rebase-'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    if (clone) rmSync(clone, { recursive: true, force: true });
  });

  it('re-verifies with check-diff against the fetched master and pushes when it passes', () => {
    const fixture = createClone(root, ['notes.md']);
    clone = fixture.clone;

    const result = run(root, clone, ['origin', 'feature', '--check-diff']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('re-verifying with check-diff against origin/master');
    expect(result.stdout).toContain('check:diff: no checks apply to the changed files');
    expect(result.stdout).not.toContain('fake npm');
    expect(git(fixture.remote, ['rev-parse', 'feature'])).toBe(git(clone, ['rev-parse', 'HEAD']));
  });

  it('stops before pushing when check-diff is red', () => {
    const fixture = createClone(root, ['tool.mjs']);
    clone = fixture.clone;

    const result = run(root, clone, ['origin', 'feature', '--check-diff']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('check-diff is red after rebase');
    expect(remoteHasFeature(fixture.remote)).toBe(false);
  });

  it('runs the full check gate without --check-diff', () => {
    const fixture = createClone(root, ['notes.md']);
    clone = fixture.clone;

    const result = run(root, clone, ['origin', 'feature']);

    expect(result.status).toBe(1);
    expect(result.stdout).toContain('fake npm run typecheck');
    expect(result.stdout).not.toContain('check:diff');
    expect(remoteHasFeature(fixture.remote)).toBe(false);
  });
});
