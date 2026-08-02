import type { AgentState } from '../agent/types.js';
import type { Managers } from '../managers.js';
import type { AggregatedScheduleView, ConnectionView, ScheduleView, TabView } from '../protocol.js';
import type { LogEntry, Tab } from './types.js';
import { buildTabViews } from './view.js';
import { rehydrateTabState } from './rehydrate.js';

export function viewTabs(
  tabs: Tab[], managers: Managers,
  connectionsFor: (label: string) => ConnectionView[], acpLabel: (label: string) => string | undefined,
  scheduleView: (label: string) => ScheduleView[], aggregatedSchedules: AggregatedScheduleView[],
  shorten: (path: string) => string,
): TabView[] {
  return buildTabViews(tabs, managers, connectionsFor, acpLabel, scheduleView, aggregatedSchedules, shorten);
}

export function rehydrateTabs(
  tabs: Tab[], loadTranscript: (name: string) => LogEntry[] | undefined,
  onState: (state: AgentState) => void, cap: (log: LogEntry[]) => LogEntry[],
): Tab[] {
  const rehydrated = rehydrateTabState(tabs, loadTranscript, onState, cap);
  for (const tab of rehydrated) tab.pane = undefined;
  return rehydrated;
}
