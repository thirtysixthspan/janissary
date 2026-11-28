import { describe, expect, it } from 'vitest';
import { CUSTOM_ANSWER_LABEL, validateChoiceRequest } from './question-choice.js';

describe('validateChoiceRequest', () => {
  it('accepts a valid list with descriptions and a default, keeping labels and descriptions verbatim', () => {
    const choices = [
      { label: ' Ship it ', description: ' Deploy to production ' },
      { label: 'Hold off', description: 'Wait for the next release' },
    ];
    expect(validateChoiceRequest('  Ship today?  ', choices, ' Ship it '))
      .toEqual({ question: '  Ship today?  ', choices, defaultOption: ' Ship it ' });
  });

  it('rejects a blank or whitespace-only question', () => {
    expect(validateChoiceRequest(' '.repeat(3), [{ label: 'Yes' }])).toBeUndefined();
    expect(validateChoiceRequest('', [{ label: 'Yes' }])).toBeUndefined();
  });

  it('rejects an empty choice list', () => {
    expect(validateChoiceRequest('Ship it?', [])).toBeUndefined();
  });

  it('rejects a blank or whitespace-only option label', () => {
    expect(validateChoiceRequest('Ship it?', [{ label: '' }])).toBeUndefined();
    expect(validateChoiceRequest('Ship it?', [{ label: '  ' }, { label: 'Yes' }])).toBeUndefined();
  });

  it('rejects the exact reserved label', () => {
    expect(validateChoiceRequest('Ship it?', [{ label: CUSTOM_ANSWER_LABEL }])).toBeUndefined();
    expect(validateChoiceRequest('Ship it?', [{ label: CUSTOM_ANSWER_LABEL.toLowerCase() }])).toBeDefined();
  });

  it('rejects an exact duplicate label', () => {
    expect(validateChoiceRequest('Ship it?', [{ label: 'Yes' }, { label: 'Yes' }])).toBeUndefined();
  });

  it('retains labels that differ only in case or whitespace', () => {
    const choices = [{ label: 'Yes' }, { label: 'yes' }, { label: ' Yes ' }];
    expect(validateChoiceRequest('Ship it?', choices)).toEqual({ question: 'Ship it?', choices });
  });

  it('rejects an empty or whitespace-only option description', () => {
    expect(validateChoiceRequest('Ship it?', [{ label: 'Yes', description: '' }])).toBeUndefined();
    expect(validateChoiceRequest('Ship it?', [{ label: 'Yes', description: '  ' }])).toBeUndefined();
  });

  it('rejects a default that does not exactly match an option label', () => {
    expect(validateChoiceRequest('Ship it?', [{ label: 'Yes' }], 'yes')).toBeUndefined();
    expect(validateChoiceRequest('Ship it?', [{ label: 'Yes' }], ' Yes')).toBeUndefined();
  });
});
