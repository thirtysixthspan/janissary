import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/planning/decompose-plan.md` splits one plan into draft subplans rated 1–5 and moves the
// source plan to complete. It runs on its own or is opened by another task, which skips its
// preparation and pick steps by heading. The split is only trustworthy if each subplan's rating
// comes from the quantitative rating task rather than the decomposing agent's judgment. These
// assertions pin those headings, the rating delegation, where files land, and the step order, and
// nothing else.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const task = read('ai/tasks/planning/decompose-plan.md');
const RATING_TASK = 'ai/tasks/planning/rate-plan-complexity-quantitative.md';
const PREPARE_STEP = 'Step 0 — Prepare the workspace';
const PICK_STEP = 'Step 1 — Pick the plan';
const SKIP = `except \`${PREPARE_STEP}\` and \`${PICK_STEP}\``;
const RATE_SUBPLANS = `Rate every draft subplan by opening \`${RATING_TASK}\` and executing every step in order, ${SKIP}, once per subplan with that subplan as the target`;

const section = (from, to) => task.slice(task.indexOf(from), to ? task.indexOf(to) : undefined);

describe('the decompose-plan task', () => {
  it('prepares the workspace in its own Step 0 and picks the plan in its own Step 1', () => {
    const step = task.indexOf(`## ${PREPARE_STEP}`);
    expect(step).toBeGreaterThan(-1);
    expect(task.indexOf('Execute `ai/tasks/workspace/prepare-workspace.md` in full')).toBeGreaterThan(step);
    expect(task.indexOf(`## ${PICK_STEP}`)).toBeGreaterThan(step);
  });

  it('tells a calling task to skip its preparation and pick steps', () => {
    expect(task).toContain(`When another task opens this one, execute every step in order ${SKIP}`);
  });

  it('decomposes every plan whatever its rating', () => {
    expect(task).toContain('Every plan you are given is decomposed, whatever its own rating, and whether or not it has one.');
    expect(task).not.toContain('needs no decomposition');
  });

  it('lets a plan with no smaller coherent pieces become a single subplan', () => {
    const write = section('## Step 3', '## Step 4');
    expect(write).toContain('Write such a plan as a single subplan that carries its full scope rather than forcing an artificial split.');
    expect(task).not.toContain('two or more');
  });

  it('never rates the source plan', () => {
    expect(task).toContain('never add one if it has none. Do not run a rating task on it.');
    expect(section('## Step 2', '## Step 3')).not.toContain(RATING_TASK);
  });

  it('writes every subplan as a draft', () => {
    expect(section('## Step 3', '## Step 4')).toContain('Write a complete draft plan for every subplan to `./product/plans/draft/');
  });

  it('rates each subplan through the quantitative rating task, never by judgment', () => {
    const rate = section('## Step 4', '## Step 5');
    expect(rate).toContain(RATE_SUBPLANS);
    expect(rate).toContain("is the subplan's rating; do not assign one by judgment");
  });

  it('splits and re-rates any subplan rated 6 or higher', () => {
    expect(section('## Step 4', '## Step 5')).toContain(
      'A subplan it rates 6 or higher is split again, and each resulting subplan is rated the same way, until every subplan is rated 1–5',
    );
  });

  it('moves the source plan to complete after rating and before reporting', () => {
    const move = section('## Step 5', '## Step 6');
    expect(move).toContain('Every subplan is rated 1–5, and each rating was recorded by the quantitative rating task');
    expect(move).toContain('Move the source plan to `./product/plans/complete/`');
    expect(task.indexOf('## Step 4')).toBeLessThan(task.indexOf('## Step 5'));
    expect(task.indexOf('## Step 5')).toBeLessThan(task.indexOf('## Step 6'));
  });

  it('keeps subplans in draft', () => {
    expect(task).toContain('Subplans stay in `./product/plans/draft/`');
  });

  it('names headings the quantitative rating task still has', () => {
    const rating = read(RATING_TASK);
    expect(rating).toContain(`## ${PREPARE_STEP}`);
    expect(rating).toContain(`## ${PICK_STEP}`);
  });

  it('names only ai/ files that exist', () => {
    const paths = new Set([...task.matchAll(/`(ai\/[^`\s*]+\.md)`/g)].map((match) => match[1]));
    expect([...paths].filter((relative) => !existsSync(path.join(repoRoot, relative)))).toEqual([]);
  });
});
