import type { Tab } from './types.js';
import type { AgentState } from '../agent/types.js';

// Assembles the persisted-state snapshot for one tab from the tab and its owned runtime state.
export function buildAgentStateFromTab(tab: Tab, extra?: Partial<AgentState>): AgentState {
  const runtime = tab.runtime;
  return {
    name: tab.label,
    dotColor: tab.dotColor,
    active: runtime?.busy ?? false,
    number: tab.number,
    group: tab.group,
    groupColor: tab.groupColor,
    cmdHistory: tab.cmdHistory,
    cwd: runtime?.cwd,
    context: runtime?.context,
    commandQueue: runtime?.queue,
    title: tab.title,
    offline: tab.offline,
    ...extra,
  };
}
