import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/build-a-complex-feature.md` prepares the workspace once and then improves every
// subplan with `improve-plan.md`, which opens by preparing it again. Each improvement runs in a fresh
// subagent that knows only what it is told, so every place the playbook asks for an improvement has
// to carry the skip itself. These assertions pin that wording, and the step it names, and nothing
// else: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const playbook = read('ai/tasks/feature/build-a-complex-feature.md');
const PREPARE_STEP = 'Step 0 — Prepare the workspace';
const SAME_SKIP = 'the same Step 0 skip';

const section = (from, to) => playbook.slice(playbook.indexOf(from), playbook.indexOf(to));

describe('the build-a-complex-feature playbook', () => {
  it('prepares the workspace in its own Step 0', () => {
    expect(section('## Step 0', '## Step 1')).toContain('Delegate `ai/tasks/workspace/prepare-workspace.md`');
  });

  it('improves every subplan without preparing the workspace again', () => {
    expect(section('## Orchestration rules', '## Step 0')).toContain(
      `skipping the improvement task's own \`${PREPARE_STEP}\``,
    );
  });

  it('skips the preparation step for planned and split-off subplans alike', () => {
    const improve = section('## Step 3', '## Step 4');
    expect(improve).toContain(`Skip its \`${PREPARE_STEP}\``);
    expect(improve).toContain(`improve each new plan the same way before implementation, with its exact draft path and ${SAME_SKIP}`);
  });

  it('skips the preparation step for a subplan added for a missing requirement', () => {
    expect(section('## Step 7', '## Step 8')).toContain(`improve it as in Step 3 immediately before implementation, with ${SAME_SKIP}`);
  });

  // The improvement task keeps its own preparation step, because a direct run still needs it.
  it('leaves improve-plan.md preparing the workspace when it runs directly', () => {
    const improvement = read('ai/tasks/planning/improve-plan.md');
    const step = improvement.indexOf(`## ${PREPARE_STEP}`);
    expect(step).toBeGreaterThan(-1);
    expect(improvement.indexOf('Execute `ai/tasks/workspace/prepare-workspace.md` in full')).toBeGreaterThan(step);
  });
});
