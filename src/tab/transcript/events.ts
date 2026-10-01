import type { Tab, LogEntry } from '../types.js';
import type { AgentState } from '../../agent/types.js';
import { messageBus } from '../../bus.js';
import { appendEntry, clearLog } from './log.js';
import { runtimeFor } from '../runtime.js';

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
// entry-updated, trailing-entry, and dirty steps the shared choreography owns.
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
      if (index !== -1) messageBus.emit('transcript', { type: 'entry:updated', tabLabel: label, tab });
      if (hooks.trailing && output) {
        messageBus.emit('transcript', { type: 'entry:appended', tabLabel: label, entry: { input: '', output }, tab });
      }
    }
  }
  messageBus.emit('state', { type: 'dirty' });
}

// Whether a tab is one the unread badge may be raised on. The badge is the app's record that a tab
// holds something the user has not looked at, so only a tab that is out of sight can carry it: a
// docked tab is permanently visible chrome, the active tab is the one being looked at, and so is the
// other pane's visible selection. Split out from `markUnreadTab` so the sites that decide whether an
// escalation still applies — a completed dwell, a harness's grace period running out — ask exactly
// the question the raise asked, rather than re-deriving the rule. A missing tab is the caller's to
// rule out, since only they know whether an absent tab is a closed tab or a typo.
export function isUnreadEligible(
  tab: Tab, label: string, activeLabel: string | undefined, secondaryLabel?: string,
): boolean {
  return !tab.dock && label !== activeLabel && label !== secondaryLabel;
}

// Raise the badge, and report whether this tab was eligible for it. The return value is what lets a
// caller that is about to schedule follow-up work on the badge — the harness's idle escalation —
// arm it only when the badge was actually raised, rather than guessing from a tab it happens to
// know is hidden. Callers that only want the badge ignore it.
export function markUnreadTab(
  tabs: Tab[], label: string, activeLabel: string | undefined, secondaryLabel?: string,
): boolean {
  const tab = tabs.find((t) => t.label === label);
  if (!tab || !isUnreadEligible(tab, label, activeLabel, secondaryLabel)) return false;
  tab.hasUnread = true;
  return true;
}

// Take the unread badge off a tab, and say so on the `tabs` channel. Every site that used to assign
// `hasUnread = false` inline comes through here, so the badge has one definition of how it is
// lowered and one signal for the work that hangs off it. The signal fires only when the flag was
// actually set: a dwell that completes on a tab nobody badged, or a request to clear a badge that
// is already down, has nothing to announce, and a spurious `unread-cleared` would cancel a pending
// harness escalation the caller knows nothing about. Returns whether the badge came off.
export function clearUnreadTab(tabs: Tab[], label: string): boolean {
  const tab = tabs.find((t) => t.label === label);
  if (!tab?.hasUnread) return false;
  tab.hasUnread = false;
  messageBus.emit('tabs', { type: 'unread-cleared', label });
  return true;
}

// The fields a producer may add to the running entry it starts, beyond its command text: the
// shell records the working directory the command ran in.
export type RunningEntryFields = Partial<Omit<LogEntry, 'input' | 'output' | 'running'>>;

export function startRunningTab(
  tabsOrBusy: Tab[] | Set<string>, label: string, input: string, append: (label: string, entry: LogEntry) => void,
  fields: RunningEntryFields = {},
): void {
  if (tabsOrBusy instanceof Set) tabsOrBusy.add(label);
  else {
    const runtime = runtimeFor(tabsOrBusy, label);
    if (runtime) runtime.busy = true;
  }
  append(label, { input, output: '', running: true, ...fields });
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
