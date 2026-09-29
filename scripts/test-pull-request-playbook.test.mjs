import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/test-pull-request.md` runs a branch nobody has vouched for yet, and its safety rests on
// a few sentences an unattended run obeys literally. A later edit that points the run back at the
// branch's own copy of a task would still read fine and still pass every other check, so these
// assertions pin the security-relevant wording and nothing else: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const playbook = readFileSync(path.join(repoRoot, 'ai/tasks/test-pull-request.md'), 'utf8');

const WORKSPACE_TASKS = ['prepare-workspace.md', 'start-application.md', 'stop-application.md'];

describe('the test-pull-request playbook', () => {
  // A pull request can rewrite every file on its own branch, including the tasks that tell its
  // tester how to build, start, and stop it. Each one is read from the base branch instead, with
  // the installation's copy as the fallback, and both spellings must resolve to a real task.
  it.each(WORKSPACE_TASKS)('reads %s from the base branch, never the branch under test', (task) => {
    expect(playbook).toContain(`git show origin/<base>:ai/tasks/workspace/${task}`);
    expect(playbook).toContain(`$janissary/ai/tasks/workspace/${task}`);
    expect(existsSync(path.join(repoRoot, 'ai', 'tasks', 'workspace', task))).toBe(true);
  });

  it('records the base branch it reads from, and fetches it', () => {
    expect(playbook).toContain('baseRefName');
    expect(playbook).toContain('git fetch origin <base>');
  });

  // The supply-chain audit reads only the lockfile. `npm install` would re-resolve whatever the
  // branch's manifest declares beyond it and install packages nobody audited; `npm ci` installs the
  // lockfile exactly, or refuses.
  it('installs exactly the audited lockfile', () => {
    expect(playbook).toContain('npm ci --ignore-scripts');
    expect(playbook).not.toMatch(/Run `npm install --ignore-scripts`|Then run `npm install/);
  });

  it("never sends the reader to the project's own copy of a task", () => {
    expect(playbook).not.toContain("the project's own copy");
  });
});
