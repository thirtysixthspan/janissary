import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const playbook = readFileSync(new URL('../ai/tasks/feature/plan-a-new-feature.md', import.meta.url), 'utf8');
const [, questionFormat] = playbook.split('### Question format\n', 2);
const [, checklistSection] = playbook.split('#### Preserved-behavior checklist\n', 2);
const [checklist] = checklistSection?.split('\n### ', 1) ?? [];

describe('feature planning preservation checklist', () => {
  it('gives each candidate its own checkbox and prechecks recommendations', () => {
    expect(questionFormat).toContain('The preserved-behavior question uses the checklist below.');
    expect(checklist).toContain('as its own checkbox.');
    expect(checklist).toContain('Start recommended behaviors checked and all other candidates unchecked.');
  });

  it('asks the user which safeguards to put in the plan and waits for confirmation', () => {
    expect(checklist).toContain('Which existing behaviors should this plan explicitly protect?');
    expect(checklist).toContain('Checking a behavior adds a safeguard to the plan so it keeps working through the change.');
    expect(checklist).toContain('Wait for the user\'s confirmation.');
    expect(checklist).toContain('each behavior in the confirmed selection.');
  });

  it('offers the same defaults and a way to change or clear them in text', () => {
    expect(checklist).toContain('independent checkboxes with initial checked states.');
    expect(checklist).toContain('`- [x]` for recommended behaviors and `- [ ]` for the rest');
    expect(checklist).toContain('`defaults`, the names of the behaviors to protect, or `none`');
  });
});
