import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const playbook = readFileSync(path.join(import.meta.dirname, '../ai/tasks/feature/build-a-complex-feature.md'), 'utf8');
const cycle = playbook.slice(playbook.indexOf('### Test, repair, and update again'), playbook.indexOf('## Step 10'));

describe('the complex-feature behavioral test cycle', () => {
  it('tests after the initial update and full review, then updates again', () => {
    expect(cycle).toContain('After the initial update above and the full-PR review in Step 8 complete');
    const test = cycle.indexOf('Delegate `ai/tasks/feature/test-pull-request.md`');
    const update = cycle.indexOf('Delegate `ai/tasks/feature/update-pull-request.md` again');
    expect(test).toBeGreaterThan(-1);
    expect(update).toBeGreaterThan(test);
    expect(cycle).toContain('with the recorded PR number');
  });

  it('drains all findings sequentially on the same PR before retesting', () => {
    expect(cycle).toContain('drain every entry in file order before another test pass');
    expect(cycle).toContain('a fresh subagent for each entry with the recorded PR number and an explicit selector');
    expect(cycle).toContain('Verify each repair is published to the same branch and PR before selecting the next entry');
    expect(cycle).toContain('After any repairs, repeat items 1 through 3');
  });

  it('requires a clean test pass even after description-only repairs', () => {
    expect(cycle).toContain('Retest even when every repaired finding was description-only');
    expect(cycle).toContain('a completed test pass adds no new backlog entries and the backlog is empty');
  });

  it('preserves behavioral testing safeguards and stops on incomplete testing', () => {
    expect(cycle).toContain('attached-browser, base-branch instruction, dependency, scratch-instance, teardown, backlog-only publication, and no-merge safeguards');
    expect(cycle).toContain('Do not substitute reading the testing steps for executing them');
    expect(cycle).toContain('missing attached browser, failed startup, browser loss, incomplete teardown, or failed publication');
    expect(cycle).toContain('Do not treat an incomplete run as a clean test pass');
    expect(cycle).toContain('Stop and report any blocked repair');
  });

  it('requires a published final update and retests code repairs it surfaces', () => {
    expect(cycle).toContain('confirm the final update is published and the PR remains open');
    expect(cycle).toContain('repeat the test/repair cycle and final update before proceeding');
    expect(cycle).toContain('A blocked update stops completion');
    expect(playbook.slice(playbook.indexOf('## Step 10'))).toContain('the behavioral test cycle completed without new findings, the final PR update is published');
  });
});
