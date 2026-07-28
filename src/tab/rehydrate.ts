import type { Tab, LogEntry, AgentState } from '../types.js';
import { makeTab, distinctColor } from './index.js';
import { listAgentStates } from '../agent/state.js';
import { applyRehydratedState } from './rehydrate-state.js';

// Reconstructs Tab objects (in `states`' order, e.g. sorted by persisted number) from saved
// AgentState records, restoring each tab's transcript, history, title, and offline flag.
export function rehydrateTabs(
  states: AgentState[],
  loadTranscript: (name: string) => LogEntry[] | undefined,
  capLog: (log: LogEntry[]) => LogEntry[],
): Tab[] {
  return states.map((s, index) => {
    const log = capLog(loadTranscript(s.name) ?? s.log ?? []);
    const tab = makeTab(
      s.name, s.dotColor || distinctColor([]), s.number ?? index + 1, s.cmdHistory ?? [],
      log, s.workspaceDir, s.group ?? 1, s.groupColor || s.dotColor || '#5b9cff',
    );
    tab.toolStepsExpanded = false;
    if (s.title) tab.title = s.title;
    if (s.offline) tab.offline = s.offline;
    return tab;
  });
}

// Rebuilds the whole tab list from persisted agent state, restoring the per-label cwd, context,
// and queue maps alongside it. Returns `tabs` unchanged when nothing was persisted.
export function rehydrateTabState(
  tabs: Tab[],
  cwd: Map<string, string>,
  context: Map<string, string[]>,
  queue: Map<string, string[]>,
  loadTranscript: (name: string) => LogEntry[] | undefined,
  onState: (state: AgentState) => void,
  cap: (log: LogEntry[]) => LogEntry[],
): Tab[] {
  const states = listAgentStates().toSorted((a, b) => (a.number ?? Infinity) - (b.number ?? Infinity));
  if (states.length === 0) return tabs;
  const rehydrated = rehydrateTabs(states, loadTranscript, cap);
  applyRehydratedState(states, cwd, context, queue, onState);
  return rehydrated;
}
