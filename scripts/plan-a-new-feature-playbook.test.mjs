import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/plan-a-new-feature.md` prepares the workspace once and then runs two improvement
// tasks that each open by preparing it again. Its Step 2f tells the agent to skip that step by name,
// so a renamed or renumbered step in either task would leave the override pointing at nothing and
// still read fine. These assertions pin the wording on both sides of the override and nothing else:
// not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const playbook = read('ai/tasks/feature/plan-a-new-feature.md');
const PREPARE = 'Execute `ai/tasks/workspace/prepare-workspace.md` in full';
const PREPARE_STEP = 'Step 0 — Prepare the workspace';
const IMPROVEMENT_TASKS = ['improve-plan.md', 'improve-plan-with-minimalism.md'];

const improveSection = playbook.slice(playbook.indexOf('### 2f.'), playbook.indexOf('### 2g.'));

describe('the plan-a-new-feature playbook', () => {
  it('prepares the workspace in its own Step 0, before the improvement passes', () => {
    const prepare = playbook.indexOf(PREPARE);
    expect(prepare).toBeGreaterThan(playbook.indexOf(`## ${PREPARE_STEP}`));
    expect(playbook.indexOf('### 2f.')).toBeGreaterThan(prepare);
  });

  it.each(IMPROVEMENT_TASKS)('runs %s without preparing the workspace again', (task) => {
    expect(improveSection).toContain(`\`ai/tasks/planning/${task}\``);
    expect(improveSection).toContain(`each in full except for its \`${PREPARE_STEP}\``);
    expect(improveSection).toContain('Skip that Step 0 in both.');
  });

  // The improvement tasks keep their own preparation step, because a direct run still needs it.
  it.each(IMPROVEMENT_TASKS)('leaves %s preparing the workspace when it runs directly', (task) => {
    const improvement = read(`ai/tasks/planning/${task}`);
    const step = improvement.indexOf(`## ${PREPARE_STEP}`);
    expect(step).toBeGreaterThan(-1);
    expect(improvement.indexOf(PREPARE)).toBeGreaterThan(step);
  });
});
