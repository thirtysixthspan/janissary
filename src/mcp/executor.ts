import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { QUESTION_CANCELLED } from '../questions.js';
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
    let settled = false;
    const onAbort = () => {
      if (settled) return;
      notify(managers, 'question-withdrawn', label);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      const answer = await managers.questions.register({ tab: label, kind, question, options }, signal);
      return { text: signal.aborted ? QUESTION_CANCELLED : answer, isError: false };
    } finally {
      settled = true;
      signal.removeEventListener('abort', onAbort);
    }
  };
}
