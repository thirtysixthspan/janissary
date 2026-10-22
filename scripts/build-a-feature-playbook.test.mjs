import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/build-a-feature.md` ends the way `build-a-complex-feature.md` does: it opens its
// pull request, reviews it and drains the findings until a review adds none, then updates it. The
// complex task delegates the build task once per subplan and runs those closing stages itself, so
// it has to tell each subplan build to skip them. These assertions pin the wording on both sides of
// that handoff, and the child-task rules the overrides lean on, and nothing else: not prose, not
// structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const read = (relative) => readFileSync(path.join(repoRoot, relative), 'utf8');

const playbook = read('ai/tasks/feature/build-a-feature.md');
const complex = read('ai/tasks/feature/build-a-complex-feature.md');

const between = (text, from, to) => text.slice(text.indexOf(from), text.indexOf(to));
const step = (n) => playbook.indexOf(`## Step ${n} — `);

describe('the build-a-feature playbook', () => {
  it('opens the pull request before reviewing it', () => {
    expect(between(playbook, '## Step 7', '## Step 8')).toContain('Execute `ai/tasks/workspace/open-feature-pull-request.md` in full');
    expect(step(8)).toBeGreaterThan(step(7));
  });

  it('reviews the pull request and drains every finding one at a time', () => {
    const review = between(playbook, '## Step 8', '## Step 9');
    expect(review).toContain('Delegate `ai/tasks/feature/review-pull-request.md` to a fresh subagent');
    expect(review).toContain('delegating `ai/tasks/feature/work-pull-request-issue.md` to a fresh subagent');
    expect(review).toContain('Resolve every entry in file order, one at a time');
    expect(review).toContain('override only its complexity-7 cutoff');
  });

  it('repeats the review until one records no new findings', () => {
    expect(between(playbook, '## Step 8', '## Step 9')).toContain('Continue until a review records no new findings and the backlog is empty');
  });

  it('updates the pull request after the review cycle and before the report', () => {
    expect(between(playbook, '## Step 9', '## Step 10')).toContain('delegate `ai/tasks/feature/update-pull-request.md` to a fresh subagent');
    expect(step(9)).toBeGreaterThan(step(8));
    expect(playbook.indexOf('## Step 10 — Report')).toBeGreaterThan(step(9));
  });
});

describe('the build-a-complex-feature playbook', () => {
  it('keeps every subplan build from opening, reviewing, or updating the pull request', () => {
    expect(between(complex, '## Step 4', '## Step 5')).toContain(
      "Do not run the build task's PR-opening handoff, its review-and-repair cycle, or its pull request update.",
    );
  });
});

describe('the child tasks the closing stages rely on', () => {
  // Step 8 overrides this rule by name; if it disappears, the override points at nothing.
  it('still has work-pull-request-issue.md refusing entries rated 7 or higher', () => {
    expect(read('ai/tasks/feature/work-pull-request-issue.md')).toContain('**Choosing an entry rated 7 or higher.**');
  });

  // Step 9 runs the update without an override because it finds the plan in the first commit.
  it('still has update-pull-request.md finding the own plan from the first commit', () => {
    expect(read('ai/tasks/feature/update-pull-request.md')).toContain("take its first line: the branch's first commit");
  });
});
