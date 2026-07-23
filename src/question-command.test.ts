import { describe, expect, it, vi } from 'vitest';
import {
  extractQuestionCommand,
  parseQuestionCommand,
  QUESTION_USAGE,
  runQuestionCommand,
} from './question-command.js';
import type { Questions } from './questions.js';

describe('parseQuestionCommand', () => {
  it('parses a quoted free-text question', () => {
    expect(parseQuestionCommand('question ask "What port should I use?"')).toEqual({
      kind: 'ask',
      question: 'What port should I use?',
    });
  });

  it('parses approval options and preserves labels containing spaces', () => {
    expect(parseQuestionCommand('question approve "Deploy now?" Yes No "Not yet"')).toEqual({
      kind: 'approve',
      question: 'Deploy now?',
      options: ['Yes', 'No', 'Not yet'],
    });
  });

  it.each([
    'question',
    'question ask',
    'question ask Too many words',
    'question approve "Deploy now?"',
    'question approve "unterminated Yes No',
  ])('rejects malformed command: %s', (command) => {
    expect(parseQuestionCommand(command)).toEqual({ error: QUESTION_USAGE });
  });
});

describe('extractQuestionCommand', () => {
  it('extracts a question command from the final agent reply line', () => {
    expect(extractQuestionCommand([
      'I need the deployment target.',
      'question approve "Where should I deploy?" Staging Production',
    ].join('\n'))).toBe('question approve "Where should I deploy?" Staging Production');
  });

  it('ignores question-shaped prose', () => {
    expect(extractQuestionCommand('I have a question about which port to use.')).toBeNull();
  });
});

describe('runQuestionCommand', () => {
  it('registers a valid command for the issuing tab', async () => {
    const register = vi.fn(async () => 'Production');
    const questions = { register } as unknown as Questions;

    await expect(runQuestionCommand(
      'question approve "Deploy?" Staging Production',
      'build',
      questions,
    )).resolves.toBe('Production');
    expect(register).toHaveBeenCalledWith({
      tab: 'build',
      kind: 'approve',
      question: 'Deploy?',
      options: ['Staging', 'Production'],
    });
  });

  it('returns usage without registering a malformed command', () => {
    const register = vi.fn();
    const questions = { register } as unknown as Questions;

    expect(runQuestionCommand('question approve "Deploy?"', 'build', questions)).toBe(QUESTION_USAGE);
    expect(register).not.toHaveBeenCalled();
  });
});
