import { describe, it, expect, beforeEach } from 'vitest';
import { TabManager } from '../tab/manager.js';
import { Questions } from '../questions.js';
import type { Managers } from '../managers.js';
import { command } from './question.js';
import { seedRootTab } from '../tab/root-tab-test-fixture.js';

function makeManagers(): Managers {
  const managers = {} as Managers;
  managers.tab = new TabManager(managers);
  seedRootTab(managers.tab);
  managers.questions = new Questions();
  managers.schedule = { get: () => [] } as unknown as Managers['schedule'];
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

  it('awaits an answer and resolves cancellation for an invocation-scoped question', async () => {
    const controller = new AbortController();
    const pendingAnswer = command.run('question ask "What next?"', { label: 'janus', index: 0 }, managers, {
      runId: 'run', invocationId: 'invocation', caller: { label: 'janus', cwd: process.cwd(), context: [] }, signal: controller.signal, awaitResult: true,
    });
    const pending = managers.questions.pendingFor('janus')!;
    expect(managers.questions.answer('janus', pending.id, 'Continue')).toBe(true);
    await expect(pendingAnswer).resolves.toBe('Continue');

    const cancelled = command.run('question ask "Stop?"', { label: 'janus', index: 0 }, managers, {
      runId: 'run-2', invocationId: 'invocation-2', caller: { label: 'janus', cwd: process.cwd(), context: [] }, signal: controller.signal, awaitResult: true,
    });
    controller.abort();
    await expect(cancelled).resolves.toBe('Question cancelled.');
  });

  it('appends usage text for a malformed command without registering a question or running', () => {
    command.run('question ask', { label: 'janus', index: 0 }, managers);

    expect(managers.questions.pendingFor('janus')).toBeUndefined();
    expect(managers.tab.isBusy('janus')).toBe(false);
    expect(log(managers, 'janus').some((e) => e.output.startsWith('Usage: question'))).toBe(true);
  });
});
