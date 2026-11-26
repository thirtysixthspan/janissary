import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitFiles, createRepo, git, gitEnv } from './git-fixture.mjs';
import { scriptPath } from './script-path.mjs';

const lintFiles = scriptPath('lint-files.mjs');

// Run from a scratch project rather than this checkout, so the only ESLint the script can find is
// one the test planted in the scratch project's own `node_modules`.
function run(cwd) {
  return spawnSync(process.execPath, [lintFiles, 'a.ts'], { cwd, encoding: 'utf8', timeout: 30_000 });
}

describe('lint-files', () => {
  let project;
  beforeEach(() => { project = mkdtempSync(path.join(os.tmpdir(), 'lint-files-')); });
  afterEach(() => { rmSync(project, { recursive: true, force: true }); });

  it("lints with the working directory's own ESLint, not the one beside the script", () => {
    const bin = path.join(project, 'node_modules', '.bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, 'eslint'), '#!/bin/sh\necho "project eslint $*"\n');
    chmodSync(path.join(bin, 'eslint'), 0o755);

    const result = run(project);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('project eslint');
    expect(result.stdout).toContain('a.ts');
  });

  it("lints the branch's committed files with --base and never forwards it to ESLint", () => {
    rmSync(project, { recursive: true, force: true });
    project = createRepo('lint-files-');
    writeFileSync(path.join(project, '.gitignore'), 'node_modules/\n');
    git(project, ['add', '.gitignore']);
    git(project, ['commit', '--quiet', '--no-verify', '--message', 'chore: ignore node_modules']);
    git(project, ['checkout', '--quiet', '-b', 'feature']);
    commitFiles(project, ['tool.mjs'], 'feat: add a tool');
    const bin = path.join(project, 'node_modules', '.bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(path.join(bin, 'eslint'), '#!/bin/sh\necho "project eslint $*"\n');
    chmodSync(path.join(bin, 'eslint'), 0o755);

    const result = spawnSync(process.execPath, [lintFiles, '--base', 'master'], { cwd: project, env: gitEnv, encoding: 'utf8', timeout: 30_000 });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('tool.mjs');
    expect(result.stdout).not.toContain('--base');
    expect(result.stdout).not.toContain('master');
  });

  it('fails with a pointer to npm install when the project has no ESLint', () => {
    const result = run(project);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(path.join(project, 'node_modules', '.bin', 'eslint'));
    expect(result.stderr).toContain('npm install');
  });
});
