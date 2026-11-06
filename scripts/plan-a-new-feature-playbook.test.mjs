import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/plan-a-new-feature.md` prepares the workspace once and then runs two improvement
// tasks that each open by preparing it again. Its Step 2g tells the agent to skip that step by name,
// so a renamed or renumbered step in either task would leave the override pointing at nothing and
// still read fine. The same goes for the playbook's own step letters and the files it sends the agent
// to read: a phase inserted or a guideline moved leaves a reference that names nothing. The move of
// the finished plan into the ready folder is pinned too, since its place in the order matters. These
// assertions pin that wording and those cross-references and nothing else: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const playbook = read('ai/tasks/feature/plan-a-new-feature.md');
const PREPARE = 'Execute `ai/tasks/workspace/prepare-workspace.md` in full';
const PREPARE_STEP = 'Step 0 — Prepare the workspace';
const IMPROVEMENT_TASKS = ['improve-plan.md', 'improve-plan-with-minimalism.md'];

const improveSection = playbook.slice(playbook.indexOf('### 2g.'), playbook.indexOf('### 2h.'));

const stepHeadings = new Set([...playbook.matchAll(/^### (2[a-z])\. /gm)].map((match) => match[1]));
const stepReferences = new Set([...playbook.matchAll(/\b(2[a-z])\b/g)].map((match) => match[1]));
const aiPaths = new Set([...playbook.matchAll(/`(ai\/[^`\s*]+\.md)`/g)].map((match) => match[1]));

describe('the plan-a-new-feature playbook', () => {
  it('prepares the workspace in its own Step 0, before the improvement passes', () => {
    const prepare = playbook.indexOf(PREPARE);
    expect(prepare).toBeGreaterThan(playbook.indexOf(`## ${PREPARE_STEP}`));
    expect(playbook.indexOf('### 2g.')).toBeGreaterThan(prepare);
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

  // The improvement passes pick their plan out of the draft folder, so the move to ready has to come
  // after them and the final question phase, and before the merge ships it.
  it('promotes the completed plan to ready after the final question phase and before merging', () => {
    const promote = playbook.indexOf('mv ./product/plans/draft/<slug>.md ./product/plans/ready/<slug>.md');
    expect(promote).toBeGreaterThan(playbook.indexOf('### 2h.'));
    expect(playbook.indexOf('ai/tasks/workspace/merge-change-to-master.md` in full')).toBeGreaterThan(promote);
    expect(playbook).toContain('Planned:  ./product/plans/ready/<file>');
  });

  it('points every step reference at a step heading that exists', () => {
    expect(stepReferences.size).toBeGreaterThan(0);
    expect([...stepReferences.difference(stepHeadings)]).toEqual([]);
  });

  it('names only ai/ files that exist', () => {
    expect(aiPaths).toContain('ai/guidelines/react-code-organization.md');
    const missing = [...aiPaths].filter((relative) => !existsSync(path.join(repoRoot, relative)));
    expect(missing).toEqual([]);
  });
});
