import type { Tab, LogEntry, AgentState } from '../types.js';
import { messageBus } from '../bus.js';
import { appendEntry, finishEntry, clearLog } from './transcript-ops.js';

// Transcript/busy-tracking coordination extracted from TabManager: wraps the pure log
// mutations in transcript-ops.ts with the messageBus emits, persistence, and unread-marking
// that make them visible to the rest of the app.

export function markUnreadTab(tabs: Tab[], label: string, activeLabel: string | undefined): void {
  const tab = tabs.find((t) => t.label === label);
  if (!tab || tab.dock || label === activeLabel) return;
  tab.hasUnread = true;
}

export function startRunningTab(
  busy: Set<string>, label: string, input: string, append: (label: string, entry: LogEntry) => void,
): void {
  busy.add(label);
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
