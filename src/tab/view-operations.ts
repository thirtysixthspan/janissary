import type { AgentState } from '../agent/types.js';
import type { LogEntry, Tab } from './types.js';
import { buildTabViews } from './view.js';
import { rehydrateTabState } from './rehydrate.js';

export function viewTabs(...args: Parameters<typeof buildTabViews>): ReturnType<typeof buildTabViews> {
  return buildTabViews(...args);
}

export function rehydrateTabs(
  tabs: Tab[], loadTranscript: (name: string) => LogEntry[] | undefined,
  onState: (state: AgentState) => void, cap: (log: LogEntry[]) => LogEntry[],
): Tab[] {
  const rehydrated = rehydrateTabState(tabs, loadTranscript, onState, cap);
  for (const tab of rehydrated) tab.pane = undefined;
  return rehydrated;
}
