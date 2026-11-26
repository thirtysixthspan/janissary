import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const playbook = readFileSync(new URL('../ai/tasks/feature/plan-a-new-feature.md', import.meta.url), 'utf8');

function section(heading) {
  const [, remainder] = playbook.split(`${heading}\n`, 2);
  const [body] = remainder?.split('\n#', 1) ?? [];
  return body;
}

const questionFormat = section('### Question format');
const preservation = section('#### Preserved-behavior checklist');
const extras = section('#### Scope-extras checklist');

describe('feature planning preservation checklist', () => {
  it('gives each candidate its own checkbox and prechecks recommendations', () => {
    expect(questionFormat).toContain('Preserved-behavior and scope-extras questions use checklists.');
    expect(preservation).toContain('as its own checkbox.');
    expect(preservation).toContain('Start recommended behaviors checked and all other candidates unchecked.');
  });

  it('asks the user which safeguards to put in the plan and waits for confirmation', () => {
    expect(preservation).toContain('Which existing behaviors should this plan explicitly protect?');
    expect(preservation).toContain('Checking a behavior adds a safeguard to the plan so it keeps working through the change.');
    expect(preservation).toContain('Wait for the user\'s confirmation.');
    expect(preservation).toContain('each behavior in the confirmed selection.');
  });

  it('offers the same defaults and a way to change or clear them in text', () => {
    expect(questionFormat).toContain('independent checkboxes with the required initial states.');
    expect(questionFormat).toContain('Otherwise, show a Markdown checklist.');
    expect(preservation).toContain('`- [x]` for recommended behaviors and `- [ ]` for the rest');
    expect(preservation).toContain('`defaults`, the names of the behaviors to protect, or `none`');
  });
});

describe('feature planning scope-extras checklist', () => {
  it('asks about optional features using one unchecked checkbox per extra', () => {
    expect(extras).toContain('Which optional features should this plan include?');
    expect(extras).toContain('List each extra as its own checkbox. Start every checkbox unchecked.');
    expect(extras).toContain('including in the final phase');
  });

  it('lets the user select extras or decline all in text', () => {
    expect(questionFormat).toContain('For scope extras, it must also accept an empty selection.');
    expect(extras).toContain('show every extra as `- [ ]`');
    expect(extras).toContain('reply with the names of the extras to include or `none`');
  });

  it('adds only confirmed extras to the plan', () => {
    expect(extras).toContain('Wait for the user\'s confirmation.');
    expect(extras).toContain('Record each checked extra in the draft\'s `Requirements`.');
    expect(extras).toContain('Unchecked extras stay outside the implementation scope.');
    expect(extras).toContain('An empty confirmed selection adds no extras.');
  });
});
