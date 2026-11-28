import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { QUESTION_ERROR, type QuestionArgs } from './question-tool.js';
import { byLabelOrAlias } from '../tab/lookup.js';
import type { ToolExecutor } from './tools.js';

export function createLocalExecutor(managers: Managers): ToolExecutor {
  return async (_name, args, signal) => {
    const { tab: requested, kind, question, options } = args as QuestionArgs;
    const tab = byLabelOrAlias(managers.tab.tabs, requested);
    if (!tab) return { text: QUESTION_ERROR.noTab(requested), isError: true };
    const label = tab.label;
    if (tab.harness) tab.harness.mcpUsed = true;
    messageBus.emit('state', { type: 'dirty' });
    const answer = await managers.questions.register(
      { tab: label, kind, question, options },
      signal,
      () => notify(managers, 'question-withdrawn', label),
    );
    return { text: answer, isError: false };
  };
}
