import { describe, expect, it, vi } from 'vitest';
import { QUESTION_CANCELLED, Questions } from './questions.js';

describe('Questions', () => {
  it('exposes a registered question for its tab', () => {
    const questions = new Questions();
    void questions.register({ tab: 'build', kind: 'ask', question: 'What port?' });

    expect(questions.pendingFor('build')).toMatchObject({
      tab: 'build',
      kind: 'ask',
      question: 'What port?',
    });
  });

  it('resolves an answered question with the given value', async () => {
    const questions = new Questions();
    const result = questions.register({
      tab: 'build',
      kind: 'approve',
      question: 'Deploy?',
      options: ['Yes', 'No'],
    });
    const pending = questions.pendingFor('build')!;

    expect(questions.answer('build', pending.id, 'Yes')).toBe(true);
    await expect(result).resolves.toBe('Yes');
    expect(questions.pendingFor('build')).toBeUndefined();
  });

  it('reports cancellation to the waiting agent', async () => {
    const questions = new Questions();
    const result = questions.register({ tab: 'build', kind: 'ask', question: 'What port?' });
    const pending = questions.pendingFor('build')!;

    questions.answer('build', pending.id, null);
    await expect(result).resolves.toBe(QUESTION_CANCELLED);
  });

  it('resolves active and queued questions when their tab closes', async () => {
    const questions = new Questions();
    const first = questions.register({ tab: 'build', kind: 'ask', question: 'First?' });
    const second = questions.register({ tab: 'build', kind: 'ask', question: 'Second?' });

    questions.cancelTab('build');

    await expect(first).resolves.toBe(QUESTION_CANCELLED);
    await expect(second).resolves.toBe(QUESTION_CANCELLED);
    expect(questions.pendingFor('build')).toBeUndefined();
  });

  it('holds a second question until the first resolves', async () => {
    const changes = vi.fn();
    const questions = new Questions(changes);
    const first = questions.register({ tab: 'build', kind: 'ask', question: 'First?' });
    const second = questions.register({ tab: 'build', kind: 'ask', question: 'Second?' });

    expect(questions.pendingFor('build')?.question).toBe('First?');
    questions.answer('build', questions.pendingFor('build')!.id, 'first answer');
    await expect(first).resolves.toBe('first answer');
    expect(questions.pendingFor('build')?.question).toBe('Second?');
    expect(changes).toHaveBeenLastCalledWith('build', expect.objectContaining({ question: 'Second?' }));

    questions.answer('build', questions.pendingFor('build')!.id, 'second answer');
    await expect(second).resolves.toBe('second answer');
  });
});
