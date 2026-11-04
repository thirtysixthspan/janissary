import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/build-a-complex-feature.md` Step 6 works every finding from a subplan's focused
// review before any other review runs, then runs a resolution review that only confirms those
// findings were resolved. Each repair deletes its own backlog entry, so the orchestrator has to
// record the entries first. These assertions pin that wording and nothing else: not prose, not
// structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const playbook = readFileSync(path.join(repoRoot, 'ai/tasks/feature/build-a-complex-feature.md'), 'utf8');
const subplanReview = playbook.slice(playbook.indexOf('## Step 6'), playbook.indexOf('## Step 7'));

describe('the build-a-complex-feature subplan review cycle', () => {
  it('records the entries and head SHA before any repair', () => {
    expect(subplanReview).toContain('record the full text of every entry and the PR head SHA before any repair starts');
  });

  it('works every finding before another review runs', () => {
    expect(subplanReview).toContain('Work every recorded entry before any further review runs.');
    expect(subplanReview).toContain('Do not review a repair commit as it lands.');
  });

  it('follows the repairs with a resolution review scoped to the recorded findings', () => {
    expect(subplanReview).toContain('Once the backlog is empty, delegate `ai/tasks/feature/review-pull-request.md` to a fresh subagent as a resolution review.');
    expect(subplanReview).toContain('the promises are the recorded entries and the fix plans the repairs added in that range');
    expect(subplanReview).toContain('Do not re-review the original implementation commit');
  });

  it('repeats until a resolution review records nothing', () => {
    expect(subplanReview).toContain('Continue until a resolution review records no new findings and the backlog is empty.');
  });
});
