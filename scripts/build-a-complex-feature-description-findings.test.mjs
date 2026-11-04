import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/build-a-complex-feature.md` follows every review that records findings with
// another review. When every finding asks only for a pull request description correction, the
// repairs change no code, so the playbook skips that follow-up review once it has confirmed the
// repairs touched nothing else and the description carries each correction. These assertions pin
// that wording and nothing else: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const playbook = readFileSync(path.join(repoRoot, 'ai/tasks/feature/build-a-complex-feature.md'), 'utf8');
const section = (from, to) => playbook.slice(playbook.indexOf(from), playbook.indexOf(to));

const rules = section('## Orchestration rules', '## Step 0');
const subplanReview = section('## Step 6', '## Step 7');
const fullReview = section('## Step 8', '## Step 9');

const RANGE_CHECK = 'changed only fix plans under `./product/plans/complete/` and `./product/backlog/pull-request.md`';
const BODY_CHECK = '`gh pr view <number> --json body` shows each correction';

describe('description-only review findings in build-a-complex-feature', () => {
  it('defines a description-only entry and needs no follow-up review for one', () => {
    expect(rules).toContain(
      'An entry is description-only when its `Proposal` changes the pull request description and nothing else on the branch.',
    );
    expect(rules).toContain('no resolution review, partial review, or full re-review runs to check description corrections');
    expect(rules).toContain('If any entry calls for another change, or either check fails, the normal follow-up review runs.');
  });

  it('classifies subplan review entries before repair and skips the resolution review', () => {
    expect(subplanReview).toContain('Classify each recorded entry as description-only or not');
    expect(subplanReview).toContain('If both checks pass, skip to item 7 without a resolution review.');
  });

  it('ends the subplan repeat loop on a description-only resolution review', () => {
    expect(subplanReview).toContain('repeat items 2 through 5');
    expect(subplanReview).toContain("The cycle also ends when every entry a resolution review recorded was description-only and item 4's checks pass.");
  });

  it('skips the next full review when every full-review entry was description-only', () => {
    expect(fullReview).toContain('record the PR head SHA and classify each entry as description-only or not');
    expect(fullReview).toContain('If both checks pass, go to item 4 without another full review.');
  });

  it('requires the repair-range and description checks before either skip', () => {
    for (const step of [rules, subplanReview, fullReview]) {
      expect(step).toContain(RANGE_CHECK);
      expect(step).toContain(BODY_CHECK);
    }
  });
});
