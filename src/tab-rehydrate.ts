import type { Tab, LogEntry, AgentState } from './types.js';
import { makeTab, distinctColor } from './tab.js';

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
