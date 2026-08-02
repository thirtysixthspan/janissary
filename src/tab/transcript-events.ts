import type { Tab, LogEntry } from './types.js';
import type { AgentState } from '../agent/types.js';
import { messageBus } from '../bus.js';
import { appendEntry, finishEntry, clearLog } from './transcript-log.js';
import { runtimeFor } from './runtime.js';

// Transcript/busy-tracking coordination extracted from TabManager: wraps the pure log
// mutations in transcript-log.ts with the messageBus emits, persistence, and unread-marking
// that make them visible to the rest of the app.

export function markUnreadTab(
  tabs: Tab[], label: string, activeLabel: string | undefined, secondaryLabel?: string,
): void {
  const tab = tabs.find((t) => t.label === label);
  if (!tab || tab.dock || label === activeLabel || label === secondaryLabel) return;
  tab.hasUnread = true;
}

export function startRunningTab(
  tabsOrBusy: Tab[] | Set<string>, label: string, input: string, append: (label: string, entry: LogEntry) => void,
): void {
  if (tabsOrBusy instanceof Set) tabsOrBusy.add(label);
  else {
    const runtime = runtimeFor(tabsOrBusy, label);
    if (runtime) runtime.busy = true;
  }
  append(label, { input, output: '', running: true });
}

export function finishRunningTab(
  tabs: Tab[], label: string, output: string,
  deleteBusy: (label: string) => void,
  persist: (state: AgentState) => void,
  buildAgentState: (tab: Tab) => AgentState,
  markUnread: (label: string) => void,
): void {
  const tab = tabs.find((t) => t.label === label);
  if (tab) {
    finishEntry(tab, output);
    deleteBusy(label);
    persist(buildAgentState(tab));
  }
  if (output && tab) {
    messageBus.emit('transcript', {
      type: 'entry:appended', tabLabel: label, entry: { input: '', output }, tab,
    });
  }
  markUnread(label);
  messageBus.emit('state', { type: 'dirty' });
}

export function appendTab(
  tabs: Tab[], label: string, entry: LogEntry,
  capLog: (log: LogEntry[]) => LogEntry[],
  markUnread: (label: string) => void,
): void {
  const tab = tabs.find((t) => t.label === label);
  if (!tab) return;
  const trimmed = appendEntry(tab, entry, capLog);
  if (trimmed > 0) messageBus.emit('transcript', { type: 'entries:trimmed', tabLabel: label, count: trimmed });
  messageBus.emit('transcript', { type: 'entry:appended', tabLabel: label, entry, tab });
  markUnread(label);
  messageBus.emit('state', { type: 'dirty' });
}

export function clearTranscriptTab(
  tabs: Tab[], label: string,
  persist: (state: AgentState) => void,
  buildAgentState: (tab: Tab) => AgentState,
): void {
  const tab = tabs.find((t) => t.label === label);
  if (!tab) return;
  clearLog(tab);
  persist(buildAgentState(tab));
  messageBus.emit('transcript', { type: 'tab:cleared', tabLabel: label });
  messageBus.emit('state', { type: 'dirty' });
}
