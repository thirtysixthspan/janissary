import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/update-pull-request.md` finds a pull request's own plan as the one plan its first
// commit adds to `product/plans/complete/`. `ai/tasks/feature/build-a-complex-feature.md` moves its
// source plan there in the commit that publishes the subplans, so the update finds it without an
// override. These assertions pin that move, where it happens, and the confirmation that replaces the
// override: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const playbook = readFileSync(path.join(repoRoot, 'ai/tasks/feature/build-a-complex-feature.md'), 'utf8');

const section = (from, to) => playbook.slice(playbook.indexOf(from), playbook.indexOf(to));

describe('the build-a-complex-feature source plan', () => {
  it('moves to complete in the same commit that publishes the subplans', () => {
    const publish = section('## Step 2', '## Step 3');
    expect(publish).toContain(
      'In one commit with a Conventional Commit subject, add all initial subplan plan files and move the original source plan from `./product/plans/ready/` to `./product/plans/complete/` with `git mv`',
    );
    expect(publish).toContain('Stage only the subplan plans and the source plan move');
  });

  it('is not moved again once every requirement is delivered', () => {
    const remaining = section('## Step 7', '## Step 8');
    expect(remaining).not.toContain('move the original source plan');
    expect(remaining).toContain('confirm the original source plan is still in `./product/plans/complete/`, where Step 2 moved it');
  });

  it('is found by the update task rather than overriding its discovery', () => {
    const update = section('## Step 9', '## Step 10');
    expect(update).not.toContain('Override its Step');
    expect(update).toContain('Confirm the plan it identifies is the source plan recorded in Step 0');
  });
});
