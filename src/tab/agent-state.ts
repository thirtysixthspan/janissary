import type { Tab, AgentState } from '../types.js';

// Assembles the persisted-state snapshot for one tab — the shape saved to disk and restored by
// rehydrate() (see tab-rehydrate.ts) — from the tab itself plus the manager's per-label maps.
export function buildAgentStateFromTab(
  tab: Tab,
  busy: boolean,
  cwd: string | undefined,
  context: string[] | undefined,
  commandQueue: string[] | undefined,
  extra?: Partial<AgentState>,
): AgentState {
  return {
    name: tab.label,
    dotColor: tab.dotColor,
    active: busy,
    number: tab.number,
    group: tab.group,
    groupColor: tab.groupColor,
    cmdHistory: tab.cmdHistory,
    cwd,
    context,
    commandQueue,
    title: tab.title,
    offline: tab.offline,
    ...extra,
  };
}
