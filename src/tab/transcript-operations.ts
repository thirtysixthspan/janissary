import type { AgentState, LogEntry, Tab } from '../types.js';
import type { AggregatedScheduleView, ConnectionView, ScheduleView, TabView } from '../protocol.js';
import type { Managers } from '../managers.js';
import { listAgentStates } from '../agent/state.js';
import { capLog } from './transcript.js';
import {
  appendTab, clearTranscriptTab, finishRunningTab, startRunningTab,
} from './transcript-commands.js';
import { buildTabView } from './view.js';
import { rehydrateTabs } from './rehydrate.js';
import { applyRehydratedState } from './rehydrate-state.js';

export function buildTabViews(
  tabs: Tab[],
  cwd: Map<string, string>,
  busy: Set<string>,
  queue: Map<string, string[]>,
  managers: Managers,
  connectionsFor: (label: string) => ConnectionView[],
  acpLabel: (label: string) => string | undefined,
  scheduleView: (label: string) => ScheduleView[],
  aggregatedSchedules: AggregatedScheduleView[],
  shorten: (path: string) => string,
): TabView[] {
  return tabs.map((tab) => buildTabView(
    tab,
    busy.has(tab.label),
    cwd.get(tab.label) ?? process.cwd(),
    acpLabel(tab.label),
    connectionsFor(tab.label),
    scheduleView(tab.label),
    queue.get(tab.label) ?? [],
    shorten,
    aggregatedSchedules,
    managers.questions.pendingFor(tab.label),
  ));
}

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

export function startTabRunning(
  busy: Set<string>,
  label: string,
  input: string,
  append: (label: string, entry: LogEntry) => void,
): void {
  startRunningTab(busy, label, input, append);
}

export function finishTabRunning(
  tabs: Tab[],
  label: string,
  output: string,
  deleteBusy: (label: string) => void,
  persist: (state: AgentState) => void,
  buildAgentState: (tab: Tab) => AgentState,
  markUnread: (label: string) => void,
): void {
  finishRunningTab(tabs, label, output, deleteBusy, persist, buildAgentState, markUnread);
}

export function capTabLog(log: LogEntry[], maxLines: number): LogEntry[] {
  return capLog(log, maxLines);
}

export function appendTabTranscript(
  tabs: Tab[],
  label: string,
  entry: LogEntry,
  cap: (log: LogEntry[]) => LogEntry[],
  markUnread: (label: string) => void,
): void {
  appendTab(tabs, label, entry, cap, markUnread);
}

export function clearTabTranscript(
  tabs: Tab[],
  label: string,
  persist: (state: AgentState) => void,
  buildAgentState: (tab: Tab) => AgentState,
): void {
  clearTranscriptTab(tabs, label, persist, buildAgentState);
}
