import type { QuestionChoice } from '../protocol/tab.js';

// The reserved label for the choice that lets a user type a free-form answer. Shared by server
// validation and the web panel so neither hard-codes the words.
export const CUSTOM_ANSWER_LABEL = 'Type your own answer';

export function validateChoiceRequest(
  question: string,
  choices: QuestionChoice[],
  defaultOption?: string,
): { question: string; choices: QuestionChoice[]; defaultOption?: string } | undefined {
  if (question.trim() === '') return undefined;
  if (choices.length === 0) return undefined;
  if (choices.some((choice) => choice.label.trim() === '')) return undefined;
  if (choices.some((choice) => choice.label === CUSTOM_ANSWER_LABEL)) return undefined;
  const labels = new Set<string>();
  for (const choice of choices) {
    if (labels.has(choice.label)) return undefined;
    labels.add(choice.label);
  }
  if (choices.some((choice) => choice.description !== undefined && choice.description.trim() === '')) {
    return undefined;
  }
  if (defaultOption !== undefined && !labels.has(defaultOption)) return undefined;
  return defaultOption === undefined ? { question, choices } : { question, choices, defaultOption };
}
