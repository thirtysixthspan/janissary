import type { Managers } from '../managers.js';
import type { AgentState } from '../agent/types.js';
import type { Tab, LogEntry } from './types.js';
import type { ConnectionView, ScheduleView, TabView } from '../protocol.js';
import { buildTabViews } from './view.js';
import { rehydrateTabState } from './rehydrate.js';

type Viewport = {
  tabs: Tab[];
  managers: Managers;
  shorten(path: string): string;
};

// The two manager-facing pieces of the view lifecycle: the broadcast view built from the port,
// and a rehydrate that clears panes (a rehydrated session never starts leftover docked panes).
export function managerView(
  port: Viewport,
  connectionsFor: (label: string) => ConnectionView[],
  acpLabel: (label: string) => string | undefined,
  scheduleView: (label: string) => ScheduleView[],
): TabView[] {
  return buildTabViews(
    port.tabs, port.managers,
    connectionsFor, acpLabel, scheduleView,
    (p: string) => port.shorten(p),
  );
}

export function rehydrateTabViews(
  tabs: Tab[], loadTranscript: (name: string) => LogEntry[] | undefined,
  onState: (state: AgentState) => void, cap: (log: LogEntry[]) => LogEntry[],
): Tab[] {
  const rehydrated = rehydrateTabState(tabs, loadTranscript, onState, cap);
  for (const tab of rehydrated) tab.pane = undefined;
  return rehydrated;
}
