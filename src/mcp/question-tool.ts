import type { QuestionKind } from '../protocol.js';

export const QUESTION_ERROR = {
  noTab: (tab: string) => `No tab named "${tab}".`,
  invalidKind: 'kind must be "ask" or "approve".',
  emptyQuestion: 'question must not be empty.',
  missingOptions: 'approve needs at least one option.',
  invalidOptions: 'options must be a list of strings.',
} as const;

export type QuestionArgs = {
  tab: string;
  kind: QuestionKind;
  question: string;
  options?: string[];
};

function isStringList(value: unknown[]): value is string[] {
  return value.every((item) => typeof item === 'string');
}

function readOptions(options: unknown): { options?: string[] } | undefined {
  if (!Array.isArray(options)) return {};
  const list: unknown[] = options;
  return isStringList(list) ? { options: list } : undefined;
}

export function validateQuestionArgs(args: Record<string, unknown>): QuestionArgs | { error: string } {
  const { tab, kind, question, options } = args;
  if (kind !== 'ask' && kind !== 'approve') return { error: QUESTION_ERROR.invalidKind };
  if (typeof question !== 'string' || question.trim() === '') return { error: QUESTION_ERROR.emptyQuestion };
  const listed = readOptions(options);
  if (!listed) return { error: QUESTION_ERROR.invalidOptions };
  if (kind === 'approve' && !listed.options?.length) {
    return { error: QUESTION_ERROR.missingOptions };
  }
  return {
    tab: typeof tab === 'string' ? tab : '',
    kind,
    question,
    ...listed,
  };
}
