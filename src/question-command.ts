import type { QuestionKind } from './protocol.js';
import type { Questions } from './questions.js';

export const QUESTION_USAGE = [
  'Usage: question ask "<question>"',
  '       question approve "<question>" <option> [<option> …]',
].join('\n');

type ParsedQuestion = {
  kind: QuestionKind;
  question: string;
  options?: string[];
};

function words(input: string): string[] | undefined {
  const tokens: string[] = [];
  const pattern = /"((?:\\.|[^"\\])*)"|'([^']*)'|([^\s"']+)/g;
  let end = 0;
  for (const match of input.matchAll(pattern)) {
    if (input.slice(end, match.index).trim()) return undefined;
    tokens.push(match[1]?.replaceAll(String.raw`\"`, '"').replaceAll(String.raw`\\`, '\\') ?? match[2] ?? match[3]);
    end = match.index + match[0].length;
  }
  return input.slice(end).trim() ? undefined : tokens;
}

export function parseQuestionCommand(input: string): ParsedQuestion | { error: string } {
  const tokens = words(input.trim());
  if (!tokens || tokens[0]?.toLowerCase() !== 'question') return { error: QUESTION_USAGE };
  const kind = tokens[1]?.toLowerCase();
  const question = tokens[2];
  if (kind === 'ask' && tokens.length === 3 && question) return { kind, question };
  if (kind === 'approve' && tokens.length >= 4 && question && tokens.slice(3).every(Boolean)) {
    return { kind, question, options: tokens.slice(3) };
  }
  return { error: QUESTION_USAGE };
}

export function extractQuestionCommand(text: string): string | null {
  const lines = text.split('\n');
  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index].replace(/^[\s`$>]+/, '').replace(/`+\s*$/, '').trim();
    if (/^question\s+(ask|approve)\b/i.test(line)) return line;
  }
  return null;
}

export function runQuestionCommand(input: string, tab: string, questions: Questions): string | Promise<string> {
  const parsed = parseQuestionCommand(input);
  if ('error' in parsed) return parsed.error;
  return questions.register({ tab, ...parsed });
}

export const QUESTION_PRIMER = [
  'This host can ask the human a question through `question` commands. Syntax:',
  '  question ask "<question>"',
  '  question approve "<question>" <option> [<option> ...]',
  'Quote the question and any option containing spaces. To ask the human, end your reply with',
  'exactly one `question` command on its own final line. The host waits for the human and returns',
  'the answer to you. A cancelled question returns `Question cancelled.`. When the task is done,',
  'reply with the final answer and NO trailing command.',
].join('\n');
