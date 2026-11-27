import type { Managers } from '../managers.js';
import { deliverNotification } from '../notifications/deliver.js';
import { QUESTION_CANCELLED, Questions } from '../questions.js';
import type { Tab } from '../tab/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { messageBus } from '../bus.js';
import { createLocalExecutor } from './executor.js';

vi.mock('../notifications/deliver.js', () => ({ deliverNotification: vi.fn() }));

function fixture(title?: string) {
  const tabs = [
    {
      label: 'build', ...(title && { title }), dotColor: '#fff', number: 1, view: 'harness',
      harness: { name: 'claude', program: 'claude', ptyId: 'pty-1', status: 'running' },
    },
  ] as unknown as Tab[];
  const questions = new Questions();
  const managers = {
    tab: {
      tabs,
      byLabel: (label: string) => tabs.find((tab) => tab.label === label),
      cur: () => tabs[0],
    },
    questions,
  } as unknown as Managers;
  return { managers, questions, tabs, execute: createLocalExecutor(managers) };
}

beforeEach(() => {
  vi.mocked(deliverNotification).mockClear();
});

describe('createLocalExecutor', () => {
  it('registers a valid ask on the resolved tab and returns the answer', async () => {
    const { execute, questions } = fixture();

    const result = execute('question', { tab: 'build', kind: 'ask', question: 'Which port?' }, new AbortController().signal);
    const pending = questions.pendingFor('build');
    expect(pending).toMatchObject({ tab: 'build', kind: 'ask', question: 'Which port?' });
    expect(questions.answer('build', pending!.id, '3000')).toBe(true);
    await expect(result).resolves.toEqual({ text: '3000', isError: false });
  });

  it('registers a valid approve on the resolved tab and returns the chosen option', async () => {
    const { execute, questions } = fixture();

    const result = execute('question', {
      tab: 'build', kind: 'approve', question: 'Deploy?', options: ['Staging', 'Production'],
    }, new AbortController().signal);
    const pending = questions.pendingFor('build');
    expect(pending).toMatchObject({ tab: 'build', kind: 'approve', options: ['Staging', 'Production'] });
    expect(questions.answer('build', pending!.id, 'Production')).toBe(true);
    await expect(result).resolves.toEqual({ text: 'Production', isError: false });
  });

  it('returns Question cancelled. when the user cancels in the panel', async () => {
    const { execute, questions } = fixture();

    const result = execute('question', { tab: 'build', kind: 'ask', question: 'Which port?' }, new AbortController().signal);
    questions.answer('build', questions.pendingFor('build')!.id, null);
    await expect(result).resolves.toEqual({ text: 'Question cancelled.', isError: false });
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it('resolves an alias to the tab and registers against its label', async () => {
    const { execute, questions } = fixture('builder');

    const result = execute('question', { tab: 'BUILDER', kind: 'ask', question: 'Which port?' }, new AbortController().signal);
    expect(questions.pendingFor('build')?.question).toBe('Which port?');
    questions.answer('build', questions.pendingFor('build')!.id, '3000');
    await expect(result).resolves.toEqual({ text: '3000', isError: false });
  });

  it('marks the harness view as using MCP and emits a dirty state before registering', async () => {
    const { execute, tabs } = fixture();
    const emit = vi.spyOn(messageBus, 'emit');

    const result = execute('question', { tab: 'build', kind: 'ask', question: 'Which port?' }, new AbortController().signal);

    expect(tabs[0]?.harness?.mcpUsed).toBe(true);
    expect(emit).toHaveBeenCalledWith('state', { type: 'dirty' });
    emit.mockRestore();
    void result;
  });

  it('returns an exact no-tab error without registering or notifying', async () => {
    const { execute, questions } = fixture();
    const register = vi.spyOn(questions, 'register');

    const result = await execute('question', { tab: 'x', kind: 'ask', question: '?' }, new AbortController().signal);

    expect(result).toEqual({ text: 'No tab named "x".', isError: true });
    expect(register).not.toHaveBeenCalled();
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it('withdraws an aborted question, shows the next queued question, and records one notification', async () => {
    const { execute, questions } = fixture();
    const controller = new AbortController();
    const first = execute('question', { tab: 'build', kind: 'ask', question: 'First?' }, controller.signal);
    const second = execute('question', { tab: 'build', kind: 'ask', question: 'Second?' }, new AbortController().signal);
    expect(questions.pendingFor('build')?.question).toBe('First?');

    controller.abort();

    await expect(first).resolves.toEqual({ text: QUESTION_CANCELLED, isError: false });
    expect(questions.pendingFor('build')?.question).toBe('Second?');
    expect(deliverNotification).toHaveBeenCalledTimes(1);
    expect(vi.mocked(deliverNotification).mock.calls[0]?.[1]).toMatchObject({
      event: 'question-withdrawn',
      tabLabel: 'build',
      message: 'Question from build withdrawn',
    });
    void second;
  });

  it('does not notify when the signal aborts after the question was answered', async () => {
    const { execute, questions } = fixture();
    const controller = new AbortController();

    const result = execute('question', { tab: 'build', kind: 'ask', question: 'Which port?' }, controller.signal);
    questions.answer('build', questions.pendingFor('build')!.id, '3000');
    await expect(result).resolves.toEqual({ text: '3000', isError: false });

    controller.abort();

    expect(deliverNotification).not.toHaveBeenCalled();
  });
});
