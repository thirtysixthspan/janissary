import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const SCRIPTS = path.dirname(fileURLToPath(import.meta.url));
const RELEASE_FILES = ['release.mjs', 'release/version-files.mjs', 'release/changelog.mjs'];

// The fixture repository must not inherit a GIT_DIR or GIT_WORK_TREE from whatever runs the suite,
// or every git call the release script makes would land in that repository instead.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

const serialize = (document) => JSON.stringify(document, null, 2) + '\n';

function git(cwd, args) {
  execFileSync('git', ['-c', 'user.name=Release Test', '-c', 'user.email=release@test.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, env, stdio: 'ignore' });
}

// A repository shaped like this one where it matters to a release: the release script and its
// modules under `scripts/`, a manifest and lockfile at 0.12.0, and one commit on `master`.
function createFixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'janus-release-dry-run-'));
  mkdirSync(path.join(root, 'scripts', 'release'), { recursive: true });
  for (const file of RELEASE_FILES) copyFileSync(path.join(SCRIPTS, file), path.join(root, 'scripts', file));
  writeFileSync(path.join(root, 'package.json'), serialize({ name: 'janissary', version: '0.12.0' }));
  writeFileSync(path.join(root, 'package-lock.json'), serialize({ name: 'janissary', version: '0.12.0', lockfileVersion: 3, packages: { '': { name: 'janissary', version: '0.12.0' } } }));
  git(root, ['init', '--quiet', '--initial-branch=master']);
  git(root, ['add', '--all']);
  git(root, ['commit', '--quiet', '--no-verify', '--message', 'feat: add the release script']);
  return root;
}

// Answers the dry run's confirmation prompt with "n", which is where the report has already been
// printed and the run stops without doing anything else.
function dryRun(root) {
  const result = spawnSync(process.execPath, ['scripts/release.mjs', 'patch'], { cwd: root, env, input: 'n\n', encoding: 'utf8' });
  expect(result.status).toBe(0);
  return result.stdout;
}

const reportLine = (stdout, label) => stdout.split('\n').find((line) => line.startsWith(label));

describe('release.mjs dry run', () => {
  let root;

  beforeEach(() => {
    root = createFixture();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('reports the subject the release commit would carry', () => {
    expect(reportLine(dryRun(root), 'Would commit:')).toBe('Would commit: "feat(package): bump version to 0.12.1"');
  });

  it('reports the tag on its own line, not in place of the commit subject', () => {
    const stdout = dryRun(root);
    expect(reportLine(stdout, 'Would tag:')).toBe('Would tag:    v0.12.1');
    expect(reportLine(stdout, 'Would commit:')).not.toContain('"v0.12.1"');
  });
});
