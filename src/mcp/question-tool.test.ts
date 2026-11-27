import { describe, expect, it } from 'vitest';
import { QUESTION_ERROR, validateQuestionArgs } from './question-tool.js';

describe('validateQuestionArgs', () => {
  it('rejects an unknown kind with the exact error text', () => {
    expect(validateQuestionArgs({ tab: 'build', kind: 'maybe', question: 'Deploy?' })).toEqual({
      error: 'kind must be "ask" or "approve".',
    });
  });

  it('rejects an empty question with the exact error text', () => {
    expect(validateQuestionArgs({ tab: 'build', kind: 'ask', question: ' '.repeat(3) })).toEqual({
      error: 'question must not be empty.',
    });
  });

  it('rejects an approve with no options with the exact error text', () => {
    expect(validateQuestionArgs({ tab: 'build', kind: 'approve', question: 'Deploy?', options: [] })).toEqual({
      error: 'approve needs at least one option.',
    });
  });

  it('declares the exact no-tab error text produced after tab resolution', () => {
    expect(QUESTION_ERROR.noTab('build')).toBe('No tab named "build".');
  });

  it('accepts a valid ask', () => {
    expect(validateQuestionArgs({ tab: 'build', kind: 'ask', question: 'Which port?' })).toEqual({
      tab: 'build',
      kind: 'ask',
      question: 'Which port?',
    });
  });

  it('accepts a valid approve with options', () => {
    expect(validateQuestionArgs({
      tab: 'build',
      kind: 'approve',
      question: 'Deploy?',
      options: ['Staging', 'Production'],
    })).toEqual({
      tab: 'build',
      kind: 'approve',
      question: 'Deploy?',
      options: ['Staging', 'Production'],
    });
  });
});
