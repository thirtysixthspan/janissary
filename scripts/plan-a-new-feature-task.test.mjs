import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const playbook = readFileSync(path.join(repoRoot, 'ai', 'tasks', 'plan-a-new-feature.md'), 'utf8');

const initialDraft = '### 2c. Write the initial draft';
const firstQuestions = '### 2d. Ask the first question round';
const improvement = '### 2e. Improve the answered draft';
const remainingQuestions = '### 2f. Resolve any remaining questions';

describe('plan-a-new-feature playbook', () => {
  it('writes an initial draft before asking its first questions', () => {
    expect(playbook.indexOf(initialDraft)).toBeLessThan(playbook.indexOf(firstQuestions));
  });

  it('runs both improvement passes before resolving later questions', () => {
    expect(playbook.indexOf(firstQuestions)).toBeLessThan(playbook.indexOf(improvement));
    expect(playbook.indexOf('ai/tasks/planning/improve-plan.md')).toBeLessThan(playbook.indexOf(remainingQuestions));
    expect(playbook.indexOf('ai/tasks/planning/improve-plan-with-minimalism.md')).toBeLessThan(playbook.indexOf(remainingQuestions));
  });

  it('requires resolution instead of preserving an unresolved-plan section', () => {
    expect(playbook).not.toMatch(/^\d+\. Open questions/m);
    expect(playbook).not.toContain('Do not exceed 3 rounds total');
    expect(playbook).toContain('Continue until every box is checked');
  });
});
