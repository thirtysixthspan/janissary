import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/test-pull-request.md` runs a branch nobody has vouched for yet, and its safety rests on
// a few sentences an unattended run obeys literally. A later edit that points the run back at the
// branch's own copy of a task would still read fine and still pass every other check, so these
// assertions pin the security-relevant wording and nothing else: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const playbook = readFileSync(path.join(repoRoot, 'ai/tasks/test-pull-request.md'), 'utf8');

const WORKSPACE_TASKS = ['start-application.md', 'stop-application.md'];
const PREPARE_TASK = 'prepare-workspace.md';

describe('the test-pull-request playbook', () => {
  // A pull request can rewrite every file on its own branch, including the tasks that tell its
  // tester how to build, start, and stop it. Each one is read from the base branch instead, with
  // the installation's copy as the fallback, and both spellings must resolve to a real task.
  it.each(WORKSPACE_TASKS)('reads %s from the base branch, never the branch under test', (task) => {
    expect(playbook).toContain(`git show origin/<base>:ai/tasks/workspace/${task}`);
    expect(playbook).toContain(`$janissary/ai/tasks/workspace/${task}`);
    expect(existsSync(path.join(repoRoot, 'ai', 'tasks', 'workspace', task))).toBe(true);
  });

  // The preparation task is followed from a `master` checkout, so the branch's own copy has to
  // still be out of the working tree while it runs.
  it(`runs ${PREPARE_TASK} on master before the branch is checked out`, () => {
    const checkoutMaster = playbook.indexOf('Run `git checkout master`');
    const readPrepare = playbook.indexOf(`./ai/tasks/workspace/${PREPARE_TASK}\` from this \`master\` checkout`);
    const checkoutBranch = playbook.indexOf('Run `gh pr checkout <number>`');
    expect(checkoutMaster).toBeGreaterThan(-1);
    expect(readPrepare).toBeGreaterThan(checkoutMaster);
    expect(checkoutBranch).toBeGreaterThan(readPrepare);
    expect(playbook).toContain(`$janissary/ai/tasks/workspace/${PREPARE_TASK}`);
    expect(existsSync(path.join(repoRoot, 'ai', 'tasks', 'workspace', PREPARE_TASK))).toBe(true);
  });

  it('records the base branch it reads from, and fetches it', () => {
    expect(playbook).toContain('baseRefName');
    expect(playbook).toContain('git fetch origin <base>');
  });

  // The supply-chain audit reads only the lockfile. `npm install` would re-resolve whatever the
  // branch's manifest declares beyond it and install packages nobody audited, so the branch's
  // update runs only after the installation's audit passes and a dry-run `npm ci` proves the
  // manifest and lockfile agree.
  it('updates packages only from the audited lockfile', () => {
    const audit = playbook.indexOf('$janissary/scripts/run.mjs check-malicious-package --audit ./package-lock.json');
    const syncCheck = playbook.indexOf('Run `npm ci --dry-run --ignore-scripts`');
    const install = playbook.indexOf('Run `npm install --ignore-scripts`');
    expect(audit).toBeGreaterThan(-1);
    expect(syncCheck).toBeGreaterThan(audit);
    expect(install).toBeGreaterThan(syncCheck);
    expect(playbook).not.toMatch(/Then run `npm install/);
  });

  // The app exits when its last tab closes or on quit, so a step that does either takes every later
  // step in its batch down with it. Without these two rules the cut-off steps would be filed as
  // failures, pass alone on the rerun, and land in the backlog as false intermittent entries.
  it('isolates steps that end the session, and never reruns the steps they cut off', () => {
    expect(playbook).toContain('**`session-ending`**');
    expect(playbook).toContain('is never a rerun candidate and never intermittent');
  });

  it("never sends the reader to the project's own copy of a task", () => {
    expect(playbook).not.toContain("the project's own copy");
  });
});
