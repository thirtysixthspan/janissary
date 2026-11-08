import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const playbook = readFileSync(path.join(import.meta.dirname, '../ai/tasks/feature/build-a-complex-feature.md'), 'utf8');
const final = playbook.slice(playbook.indexOf('### Repair conflicts and failing checks'));

describe('the complex-feature final recovery', () => {
  it('resolves primary-branch conflicts on the explicit feature PR', () => {
    expect(final).toContain('baseRefName,mergeable');
    expect(final).toContain('If the result is `CONFLICTING`, delegate `ai/tasks/workspace/resolve-conflicts.md` to a fresh subagent with the recorded PR number');
    expect(final).toContain('verify the canonical plan, pass its hard gate, publish to the same head branch, and leave the PR open');
    expect(final).toContain("if the recorded base differs from the recovery task's supported primary branch, stop and report the mismatch");
    expect(final).toContain('A blocked or unsuccessful conflict resolution stops completion');
  });

  it('repairs failed local or CI checks in explicit pull request mode', () => {
    expect(final).toContain('Run `$janissary/scripts/run.mjs pr-check-gate`');
    expect(final).toContain('If the local gate fails or current-head CI checks fail, delegate `ai/tasks/workspace/fix-build.md` to a fresh subagent with the recorded PR number, explicitly selecting pull request mode');
    expect(final).toContain('Never invoke it without that number, which would select master mode');
    expect(final).toContain('implementation-and-tests-only repair scope, production-build and hard-gate proof, and published-head GitHub proof');
    expect(final).toContain('A blocked build repair stops completion');
  });

  it('requires proof for the current head rather than incomplete or stale checks', () => {
    expect(final).toContain('successful configured GitHub jobs for the current published head or its current PR merge commit');
    expect(final).toContain('Wait for queued or running checks to finish');
    expect(final).toContain('Absent, stale, skipped, cancelled, inaccessible, queued, or pending checks do not establish success');
    expect(final).toContain('Never reuse proof from a previous head');
  });

  it('retests and updates repairs while bounding recovery without merging', () => {
    expect(final).toContain("After either recovery changes the branch, return to Step 9's test/repair cycle and final update");
    expect(final).toContain('at most three times');
    expect(final).toContain('after three sequences, stop and report the unresolved failures or conflicts with the PR left open');
    expect(final).toContain('Never merge, close, or replace the feature PR during recovery');
    expect(final).toContain('mergeability is `MERGEABLE`');
  });
});
