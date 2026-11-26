import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { commitFiles, createRepo, git, gitEnv, writeFile } from './git-fixture.mjs';
import { scriptPath } from './script-path.mjs';

const moduleUrl = pathToFileURL(scriptPath('changed-files.mjs')).href;

// `changedFiles()` reads the working directory's repository, so it runs in a child process started
// inside the scratch repository rather than in the test worker.
function changedIn(cwd, base = '') {
  const source = `import { changedFiles } from ${JSON.stringify(moduleUrl)};
try { console.log(JSON.stringify(changedFiles(process.argv[1] || undefined).toSorted())); }
catch { console.log('threw'); }`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', source, base], { cwd, env: gitEnv, encoding: 'utf8' });
  const output = result.stdout.trim();
  return output === 'threw' ? output : JSON.parse(output);
}

describe('changedFiles', () => {
  let repo;

  // A feature branch that committed `added.md` and deleted `removed.md`, then has an uncommitted
  // edit to `edited.md` and an untracked `new.md`.
  beforeEach(() => {
    repo = createRepo('changed-files-', ['edited.md', 'removed.md']);
    git(repo, ['checkout', '--quiet', '-b', 'feature']);
    git(repo, ['rm', '--quiet', 'removed.md']);
    commitFiles(repo, ['added.md'], 'docs: add a file');
    writeFile(repo, 'edited.md', 'edited\n');
    writeFile(repo, 'new.md');
  });

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it('returns only uncommitted and untracked files without a base', () => {
    expect(changedIn(repo)).toEqual(['edited.md', 'new.md']);
  });

  it("adds the branch's committed files since the base and leaves out its deletions", () => {
    expect(changedIn(repo, 'master')).toEqual(['added.md', 'edited.md', 'new.md']);
  });

  it('throws on a base git cannot resolve', () => {
    expect(changedIn(repo, 'no-such-ref')).toBe('threw');
  });
});
