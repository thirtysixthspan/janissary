import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/build-a-complex-feature.md` accepts a decomposition only when every subplan is
// rated below 6. That check is worth nothing if the decomposing agent picks the number itself, so
// Step 1 rates each subplan through the quantitative rating task, skipping its preparation and pick
// steps by heading. These assertions pin that delegation, its place in Step 1, and the headings it
// names, and nothing else.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const playbook = read('ai/tasks/feature/build-a-complex-feature.md');
const RATING_TASK = 'ai/tasks/planning/rate-plan-complexity-quantitative.md';
const PREPARE_STEP = 'Step 0 — Prepare the workspace';
const PICK_STEP = 'Step 1 — Pick the plan';
const DELEGATION = `Rate every draft subplan by opening \`${RATING_TASK}\` and executing every step in order, except \`${PREPARE_STEP}\` and \`${PICK_STEP}\``;

const decompose = playbook.slice(playbook.indexOf('## Step 1'), playbook.indexOf('## Step 2'));

describe('the build-a-complex-feature decomposition', () => {
  it('rates each subplan through the quantitative rating task, skipping Step 0 and Step 1', () => {
    expect(decompose).toContain(DELEGATION);
    expect(decompose).toContain('once per subplan with that subplan as the target');
  });

  it('does not let the decomposing agent assign a rating by judgment', () => {
    expect(decompose).toContain("is the subplan's rating; do not assign one by judgment");
  });

  it('splits and re-rates any subplan rated 6 or higher', () => {
    expect(decompose).toContain(
      'A subplan it rates 6 or higher is split again, and each resulting subplan is rated the same way, until every subplan is rated 1–5',
    );
  });

  it('rates the drafts after writing them and before returning them', () => {
    const rating = decompose.indexOf(DELEGATION);
    expect(decompose.indexOf('Write a complete draft plan for every subplan')).toBeLessThan(rating);
    expect(decompose.indexOf('Return the ordered subplan paths')).toBeGreaterThan(rating);
  });

  it('accepts only ratings the quantitative rating task recorded', () => {
    expect(decompose).toContain('every rating is below 6 and was recorded by the quantitative rating task');
  });

  it('names headings the quantitative rating task still has', () => {
    const rating = read(RATING_TASK);
    expect(rating).toContain(`## ${PREPARE_STEP}`);
    expect(rating).toContain(`## ${PICK_STEP}`);
  });
});
