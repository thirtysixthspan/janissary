import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/update-pull-request.md` clears merge blockers before it describes a pull request,
// and an unattended run follows its step order literally. These assertions pin the two delegations,
// where they sit, and the step numbers another playbook overrides by name: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');
const playbook = read('ai/tasks/feature/update-pull-request.md');
const complex = read('ai/tasks/feature/build-a-complex-feature.md');

const heading = (title) => playbook.indexOf(`— ${title}\n`);
const stepNumber = (title) => playbook.match(new RegExp(String.raw`^## Step (\d+) — ${title}$`, 'm'))?.[1];
const blockers = playbook.slice(heading('Clear merge blockers'), heading('Read the pull request as it stands'));

describe('the update-pull-request playbook', () => {
  it.each([
    ['resolve-conflicts.md', '`CONFLICTING` → delegate `ai/tasks/workspace/resolve-conflicts.md` to a fresh subagent'],
    ['fix-build.md', 'Exit `1` → a check failed. Delegate `ai/tasks/workspace/fix-build.md` to a fresh subagent'],
  ])('delegates %s to a fresh subagent', (task, delegation) => {
    expect(blockers).toContain(delegation);
    expect(existsSync(path.join(repoRoot, 'ai', 'tasks', 'workspace', task))).toBe(true);
  });

  // A rebase pushes a new head and reruns CI, so the build verdict is read only after the conflicts.
  it('checks for conflicts before it checks the build', () => {
    const mergeable = blockers.indexOf('pr-check-mergeable <branch> <owner/repo>');
    const checks = blockers.indexOf('pr-wait-checks <branch> <owner/repo>');
    expect(mergeable).toBeGreaterThan(-1);
    expect(checks).toBeGreaterThan(mergeable);
  });

  // Repairs change the code, so they land after checkout and before anything is read or described.
  it('clears the blockers after checkout and before reading the pull request', () => {
    expect(stepNumber('Check out and prepare')).toBe('1');
    expect(stepNumber('Clear merge blockers')).toBe('2');
    expect(stepNumber('Read the pull request as it stands')).toBe('3');
  });

  it('stops at the report when a blocker is unresolved', () => {
    expect(blockers).toContain(`Skip Steps 3 to ${stepNumber('Confirm the pull request is still open')}`);
    expect(blockers).toContain(`go straight to Step ${stepNumber('Report')}'s report`);
  });

  it('still never merges the pull request', () => {
    expect(playbook).toContain('Never run `gh pr merge`');
  });
});

describe('the build-a-complex-feature delegation of the update task', () => {
  // The delegation names the update task's steps by number, so a renumbering must carry it along.
  it('points at the plan discovery and plan update steps', () => {
    const discovery = stepNumber('Read the pull request as it stands');
    const update = stepNumber('Update the plan');
    expect(complex).toContain(`Its Step ${discovery} plan discovery finds the canonical plan from the branch's first commit`);
    expect(complex).toContain(`Its Step ${update} treats every completed subplan plan the way it treats a fix plan`);
  });

  // The complex task moves its source plan in the first commit precisely so this lookup finds it.
  it('relies on the update task finding the own plan from the first commit', () => {
    expect(playbook).toContain('git show --name-status --format= <sha> -- product/plans/complete/');
  });
});
