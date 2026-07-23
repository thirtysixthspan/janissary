import { describe, it, expect, beforeEach } from 'vitest';
import { TabManager } from '../tab/manager.js';
import { Questions } from '../questions.js';
import type { Managers } from '../managers.js';
import { command } from './question.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  managers.questions = new Questions();
  return managers;
}

const log = (managers: Managers, label: string) =>
  managers.tab.tabs.find((t) => t.label === label)!.log;

describe('question command', () => {
  let managers: Managers;
  beforeEach(() => { managers = makeManagers(); });

  it('has the correct name', () => {
    expect(command.name).toBe('question');
  });

  it('matches ask and approve forms case-insensitively', () => {
    expect(command.match('question ask "What port?"')).toBe(true);
    expect(command.match('QUESTION APPROVE "Deploy?" Yes No')).toBe(true);
  });

  it('does not match unrelated input', () => {
    expect(command.match('questionnaire')).toBe(false);
    expect(command.match('clear')).toBe(false);
  });

  it('registers a pending ask question, marks the tab running, and resolves with the answer', async () => {
    command.run('question ask "What port?"', { label: 'janus', index: 0 }, managers);

    expect(managers.tab.isBusy('janus')).toBe(true);
    const pending = managers.questions.pendingFor('janus');
    expect(pending).toMatchObject({ tab: 'janus', kind: 'ask', question: 'What port?' });

    expect(managers.questions.answer('janus', pending!.id, '8080')).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(managers.tab.isBusy('janus')).toBe(false);
    expect(log(managers, 'janus').some((e) => e.output === '8080')).toBe(true);
  });

  it('registers a pending approve question validated against the supplied options', async () => {
    command.run('question approve "Deploy?" Yes No', { label: 'janus', index: 0 }, managers);

    const pending = managers.questions.pendingFor('janus')!;
    expect(pending).toMatchObject({ tab: 'janus', kind: 'approve', question: 'Deploy?', options: ['Yes', 'No'] });

    expect(managers.questions.answer('janus', pending.id, 'Yes')).toBe(true);
    await Promise.resolve();
    await Promise.resolve();

    expect(log(managers, 'janus').some((e) => e.output === 'Yes')).toBe(true);
  });

  it('appends usage text for a malformed command without registering a question or running', () => {
    command.run('question ask', { label: 'janus', index: 0 }, managers);

    expect(managers.questions.pendingFor('janus')).toBeUndefined();
    expect(managers.tab.isBusy('janus')).toBe(false);
    expect(log(managers, 'janus').some((e) => e.output.startsWith('Usage: question'))).toBe(true);
  });
});
