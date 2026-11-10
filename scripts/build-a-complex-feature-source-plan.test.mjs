import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// `ai/tasks/feature/update-pull-request.md` finds a pull request's own plan as the one plan its first
// commit adds to `product/plans/complete/`. `ai/tasks/feature/build-a-complex-feature.md` moves its
// source plan there in the commit that publishes the subplans, so the update finds it without an
// override. These assertions pin that move, where it happens, and the confirmation that replaces the
// override: not prose, not structure.

const repoRoot = path.resolve(import.meta.dirname, '..');
const playbook = readFileSync(path.join(repoRoot, 'ai/tasks/feature/build-a-complex-feature.md'), 'utf8');

const section = (from, to) => playbook.slice(playbook.indexOf(from), playbook.indexOf(to));

describe('the build-a-complex-feature source plan', () => {
  it('accepts the full source complexity range and selects a route', () => {
    const validate = section('## Step 0', '## Step 1');
    expect(validate).toContain('an honest complexity rating from 1–10');
    expect(validate).toContain('single-plan route (1–5) or decomposition (6–10)');
    expect(validate).not.toContain('6/10 or higher');
  });

  it('routes by one threshold everywhere it names one', () => {
    expect(playbook).not.toContain('1–3');
    expect(playbook).not.toContain('4–10');
  });

  it('keeps low-complexity plans intact while retaining every delivery stage', () => {
    const routing = section('## Orchestration rules', '## Step 0');
    expect(routing).toContain('Plans rated 1–5 are not decomposed');
    expect(routing).toContain('Run publication, improvement, implementation, focused review and repairs, full review, and PR updates');
    expect(routing).toContain('Never create a duplicate plan or fold the canonical plan into itself');
    expect(section('## Step 1', '## Step 2')).toContain('no subplan files. Continue to Step 2 and all subsequent stages');
    expect(routing).toContain('For plans rated 6–10, decompose');
    expect(routing).toContain('each with an honest `**Complexity: N/10**` rating where `N` is 1–5');
  });

  it('publishes, improves and implements the same canonical low-complexity plan', () => {
    expect(section('## Step 2', '## Step 3')).toContain('publish only the source plan move in this first commit');
    const improve = section('## Step 3', '## Step 4');
    expect(improve).toContain("Explicitly override improve-plan's draft-only location restriction");
    expect(improve).toContain('Keep the plan in `complete/`; do not promote or duplicate it');
    expect(improve).toContain('honest rating remain 1–5');
    const implement = section('## Step 4', '## Step 5');
    expect(implement).toContain("override the build task's ready-plan selection and promotion steps");
    expect(implement).toContain('Apply overrides 2 and 3 above unchanged');
    expect(implement).toContain('Do not create a second completed plan');
  });

  it('moves to complete in the same commit that publishes the subplans', () => {
    const publish = section('## Step 2', '## Step 3');
    expect(publish).toContain(
      'In one commit with a Conventional Commit subject, add all initial subplan plan files and move the original source plan from `./product/plans/ready/` to `./product/plans/complete/` with `git mv`',
    );
    expect(publish).toContain('Stage only the subplan plans and the source plan move');
  });

  it('is not moved again once every requirement is delivered', () => {
    const remaining = section('## Step 7', '## Step 8');
    expect(remaining).not.toContain('move the original source plan');
    expect(remaining).toContain('confirm the original source plan is still in `./product/plans/complete/`, where Step 2 moved it');
  });

  it('is found by the update task rather than overriding its discovery', () => {
    const update = section('## Step 9', '## Step 10');
    expect(update).not.toContain('Override its Step');
    expect(update).toContain('Confirm the plan it identifies is the source plan recorded in Step 0');
  });
});
