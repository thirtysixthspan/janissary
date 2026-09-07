import type { Tab, LogEntry } from './types.js';
import type { AgentState } from '../agent/types.js';
import { messageBus } from '../bus.js';
import { appendEntry, clearLog } from './transcript-log.js';
import { runtimeFor } from './runtime.js';

// Transcript/busy-tracking coordination extracted from TabManager: wraps the pure log
// mutations in transcript-log.ts with the messageBus emits, persistence, and unread-marking
// that make them visible to the rest of the app.

// How a producer identifies which running log entry is its own: by the command text it started
// with (the shell), by its inherent markdown flag (ACP turns), or by the running flag alone
// (the bare finalize choreography, the prior default).
export type RunningEntryMatch = { command?: string; markdown?: boolean };

// The hooks each producer supplies to `updateRunningEntry`: the steps that run when a running
// entry stops running (per-tab busy clearing, persistence, unread marking) and whether the
// shared choreography owns the trailing appended-entry emit.
export type UpdateRunningHooks = {
  trailing?: boolean;
  finalize?: (tab: Tab) => void;
  markUnread?: (label: string) => void;
};

// The one running-entry update every producer goes through: finds the running entry its match
// selects (the most recent one), rewrites its output/running, and fires the finalize, unread,
// trailing-entry, and dirty steps the shared choreography owns.
export function updateRunningEntry(
  tabs: Tab[], label: string, match: RunningEntryMatch | undefined,
  output: string, running: boolean, hooks: UpdateRunningHooks,
): void {
  const tab = tabs.find((t) => t.label === label);
  if (tab) {
    const log = [...tab.log];
    const index = log.findLastIndex((e) => !!e.running
      && (match?.command === undefined || e.input === match.command)
      && (match?.markdown === undefined || !!e.markdown));
    if (index !== -1) log[index] = { ...log[index], output, running };
    tab.log = log;
    if (!running) {
      hooks.finalize?.(tab);
      hooks.markUnread?.(label);
      if (hooks.trailing && output) {
        messageBus.emit('transcript', { type: 'entry:appended', tabLabel: label, entry: { input: '', output }, tab });
      }
    }
  }
  messageBus.emit('state', { type: 'dirty' });
}

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
  match?: RunningEntryMatch,
): void {
  updateRunningEntry(tabs, label, match, output, false, {
    trailing: true,
    finalize: (tab) => {
      deleteBusy(label);
      persist(buildAgentState(tab));
    },
    markUnread,
  });
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
