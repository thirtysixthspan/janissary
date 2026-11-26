// Scratch git repositories for script tests. The environment drops every GIT_ variable inherited
// from whatever runs the suite, so no git call can land in this checkout, then adds back a fixed
// identity and unsigned commits so rebases and commits work on any machine.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const inherited = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

export const gitEnv = {
  ...inherited,
  GIT_AUTHOR_NAME: 'Script Test',
  GIT_AUTHOR_EMAIL: 'script@test.invalid',
  GIT_COMMITTER_NAME: 'Script Test',
  GIT_COMMITTER_EMAIL: 'script@test.invalid',
  GIT_CONFIG_COUNT: '1',
  GIT_CONFIG_KEY_0: 'commit.gpgsign',
  GIT_CONFIG_VALUE_0: 'false',
};

export function git(cwd, args) {
  return execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export function writeFile(root, file, content = `${file}\n`) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), content);
}

export function commitFiles(root, files, message) {
  for (const file of files) writeFile(root, file);
  git(root, ['add', '--all']);
  git(root, ['commit', '--quiet', '--no-verify', '--message', message]);
}

// A repository on `master` with one commit holding `files`.
export function createRepo(prefix, files = ['README.md']) {
  const root = mkdtempSync(path.join(os.tmpdir(), prefix));
  git(root, ['init', '--quiet', '--initial-branch=master']);
  commitFiles(root, files, 'chore: initial commit');
  return root;
}
