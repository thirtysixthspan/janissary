import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/build-a-complex-feature.md` accepts a decomposition only when every subplan is
// rated below 6. Step 1 hands the split and the rating to `ai/tasks/planning/decompose-plan.md`,
// skipping its preparation and pick steps by heading, and then checks the ratings came from the
// quantitative rating task. These assertions pin that delegation, its place in Step 1, the headings
// it names, the acceptance check, and the cap Step 3 keeps, and nothing else.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const playbook = read('ai/tasks/feature/build-a-complex-feature.md');
const DECOMPOSE_TASK = 'ai/tasks/planning/decompose-plan.md';
const PREPARE_STEP = 'Step 0 — Prepare the workspace';
const PICK_STEP = 'Step 1 — Pick the plan';
const DELEGATION = `opens \`${DECOMPOSE_TASK}\` and executes every step in order, except \`${PREPARE_STEP}\` and \`${PICK_STEP}\`, with the source plan as the target`;

const section = (from, to) => playbook.slice(playbook.indexOf(from), playbook.indexOf(to));
const decompose = section('## Step 1', '## Step 2');

describe('the build-a-complex-feature decomposition', () => {
  it('delegates the split to the decompose-plan task, skipping Step 0 and Step 1', () => {
    expect(decompose).toContain(DELEGATION);
  });

  it('leaves the rating rules to the decompose-plan task', () => {
    expect(decompose).not.toContain('Rate every draft subplan');
    expect(decompose).not.toContain('Break the plan into the smallest coherent');
  });

  it('receives the subplans, ratings, and coverage map back from the task', () => {
    expect(decompose).toContain('returns the ordered subplan paths, dependencies, ratings, and a requirement-to-subplan coverage map to the orchestrator');
  });

  it('accepts only ratings the quantitative rating task recorded', () => {
    expect(decompose).toContain('every rating is below 6 and was recorded by the quantitative rating task');
  });

  it('stages the source plan move the decompose-plan task made', () => {
    expect(section('## Step 2', '## Step 3')).toContain(
      'For a decomposed plan, the decomposition task already made that move in Step 1; stage it as made rather than moving the plan again.',
    );
  });

  it('reads the decompose-plan task before delegating it', () => {
    expect(section('## Step 0', '## Step 1')).toContain('`decompose-plan.md`');
  });

  it('keeps the same cap when a subplan is improved', () => {
    const improve = section('## Step 3', '## Step 4');
    expect(improve).toContain('Preserve its assigned 1–5 rating; improve-plan may correct the rating only if it remains below 6');
    expect(improve).toContain('If the improvement finds the plan cannot remain below 6, split it');
    expect(improve).not.toContain('below 7');
  });

  it('names headings the decompose-plan task still has', () => {
    const task = read(DECOMPOSE_TASK);
    expect(task).toContain(`## ${PREPARE_STEP}`);
    expect(task).toContain(`## ${PICK_STEP}`);
  });
});
