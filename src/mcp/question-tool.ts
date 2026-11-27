import type { QuestionKind } from '../protocol.js';

export const QUESTION_ERROR = {
  noTab: (tab: string) => `No tab named "${tab}".`,
  invalidKind: 'kind must be "ask" or "approve".',
  emptyQuestion: 'question must not be empty.',
  missingOptions: 'approve needs at least one option.',
} as const;

export type QuestionArgs = {
  tab: string;
  kind: QuestionKind;
  question: string;
  options?: string[];
};

export function validateQuestionArgs(args: Record<string, unknown>): QuestionArgs | { error: string } {
  const { tab, kind, question, options } = args;
  if (kind !== 'ask' && kind !== 'approve') return { error: QUESTION_ERROR.invalidKind };
  if (typeof question !== 'string' || question.trim() === '') return { error: QUESTION_ERROR.emptyQuestion };
  if (kind === 'approve' && (!Array.isArray(options) || options.length === 0)) {
    return { error: QUESTION_ERROR.missingOptions };
  }
  return {
    tab: typeof tab === 'string' ? tab : '',
    kind,
    question,
    ...(Array.isArray(options) && { options: options as string[] }),
  };
}
