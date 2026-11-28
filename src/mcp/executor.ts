import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { QUESTION_ERROR, type QuestionArgs } from './question-tool.js';
import { byLabel, byLabelOrAlias } from '../tab/lookup.js';
import type { HarnessView, Tab } from '../tab/types.js';
import type { ToolExecutor } from './tools.js';

export const MCP_CHANNEL_CLOSED = Symbol('MCP channel closed');

export type RestoredMcpTab = { originalLabel: string; label: string; harness: HarnessView | undefined };

function resolveQuestionTab(tabs: Tab[], name: string, restoredTab?: RestoredMcpTab): Tab | undefined {
  if (name.toLowerCase() !== restoredTab?.originalLabel.toLowerCase()) return byLabelOrAlias(tabs, name);
  const tab = byLabel(tabs, restoredTab.label);
  return restoredTab.harness !== undefined && tab?.harness === restoredTab.harness ? tab : undefined;
}

export function createLocalExecutor(managers: Managers, restoredTab?: RestoredMcpTab): ToolExecutor {
  return async (_name, args, signal) => {
    const { tab: requested, kind, question, options } = args as QuestionArgs;
    const tab = resolveQuestionTab(managers.tab.tabs, requested, restoredTab);
    if (!tab) return { text: QUESTION_ERROR.noTab(requested), isError: true };
    const label = tab.label;
    if (tab.harness) tab.harness.mcpUsed = true;
    messageBus.emit('state', { type: 'dirty' });
    const answer = await managers.questions.register(
      { tab: label, kind, question, options },
      signal,
      () => {
        if (signal.reason !== MCP_CHANNEL_CLOSED) notify(managers, 'question-withdrawn', label);
      },
    );
    return { text: answer, isError: false };
  };
}
