import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitFiles, createRepo, git, gitEnv } from './git-fixture.mjs';
import { scriptPath } from './script-path.mjs';

const checkDiff = scriptPath('check-diff.mjs');

function run(cwd, args) {
  return spawnSync(process.execPath, [checkDiff, ...args], { cwd, env: gitEnv, encoding: 'utf8', timeout: 30_000 });
}

// Every path below is Markdown outside `help/`, so no check applies and nothing spawns npm.
describe('check-diff base ref', () => {
  let repo;

  beforeEach(() => {
    repo = createRepo('check-diff-');
    git(repo, ['checkout', '--quiet', '-b', 'feature']);
    commitFiles(repo, ['notes.md'], 'docs: add notes');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('prints no changes on a clean tree without a base, even with committed branch changes', () => {
    const result = run(repo, []);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('check:diff: no changes');
  });

  it("finds the branch's committed changes against the base", () => {
    const result = run(repo, ['--base', 'master']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('check:diff: no checks apply to the changed files');
  });

  it('names the base when nothing changed against it', () => {
    const result = run(repo, ['--base=HEAD']);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('check:diff: no changes against HEAD');
  });

  it('fails on a base git cannot resolve', () => {
    const result = run(repo, ['--base', 'no-such-ref']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('check:diff: cannot diff against no-such-ref');
  });

  it('fails when --base has no ref', () => {
    const result = run(repo, ['--base']);
    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe('check:diff: --base needs a git ref');
  });
});
