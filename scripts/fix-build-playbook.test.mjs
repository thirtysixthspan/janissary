import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/workspace/fix-build.md` repairs `master` by default and an open pull request only when
// given its number, `#number`, or URL. These assertions pin how it picks the target, how each mode
// prepares and ships, and the statuses its caller reads: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');
const playbook = read('ai/tasks/workspace/fix-build.md');
const update = read('ai/tasks/feature/update-pull-request.md');

const step = (number) => {
  const start = playbook.indexOf(`## Step ${number} — `);
  const end = playbook.indexOf(`## Step ${number + 1} — `);
  return playbook.slice(start, end === -1 ? undefined : end);
};

describe('the fix-build playbook', () => {
  it('targets master when the invocation supplies no value', () => {
    expect(step(0)).toContain('If the task invocation supplies no value, the target is `master` and the task works in **master mode**.');
    expect(step(0)).toContain('Do not look for a pull request from the current branch or from the list of open pull requests.');
  });

  it('targets a pull request only from its number, #number, or URL', () => {
    expect(step(0)).toContain('it must be a positive PR number, `#number`, or full GitHub PR URL');
    expect(step(0)).toContain('including a head branch name, stops before checkout or installation');
    expect(step(0)).toContain('`Reason: pull request number, #number, or PR URL required`');
  });

  it('prepares master in full but only the dependencies of a pull request branch', () => {
    expect(step(1)).toContain('**Master mode.** Execute `ai/tasks/workspace/prepare-workspace.md` in full.');
    expect(step(1)).toContain('Follow only Steps 2 and 3.');
  });

  it('ships a master repair through the merge workflow but holds its merge for GitHub proof', () => {
    expect(step(6)).toContain('Execute Steps 0 through 6 of `ai/tasks/workspace/merge-change-to-master.md`.');
    expect(step(6)).toContain('Do not run that task\'s Step 7 merge yet');
    expect(step(7)).toContain('Once the proof above holds, execute Step 7 of `ai/tasks/workspace/merge-change-to-master.md`');
    expect(playbook).toContain('never push to `master` directly');
  });

  it('still never merges a target pull request', () => {
    expect(playbook).toContain('7. **In pull request mode, never merge or close the PR, open a replacement, or push to another branch.**');
  });

  it('changes nothing when master has no failure', () => {
    expect(step(2)).toContain('Change nothing, skip to Step 8, and report `Status: complete; no failure on master`.');
  });

  it('reports every status, including the one its caller reads', () => {
    expect(step(8)).toContain('complete; PR open | complete; merged to master | complete; no failure on master | blocked — <reason>');
    expect(update).toContain('Delegate `ai/tasks/workspace/fix-build.md` to a fresh subagent with the recorded pull request number.');
    expect(update).toContain('When it reports anything but `Status: complete; PR open`, the blocker stands.');
  });
});
