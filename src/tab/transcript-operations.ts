import type { AgentState } from '../agent/types.js';
import type { LogEntry, Tab } from './types.js';
import { recordHistory } from './history.js';
import { capLog } from './transcript-log.js';
import {
  appendTab, clearTranscriptTab, finishRunningTab, markUnreadTab, startRunningTab,
} from './transcript-events.js';

export function startRunning(
  tabs: Tab[], label: string, input: string, append: (label: string, entry: LogEntry) => void,
): void {
  startRunningTab(tabs, label, input, append);
}

export function finishRunning(
  tabs: Tab[], label: string, output: string, deleteBusy: (label: string) => void,
  persist: (state: AgentState) => void, buildAgentState: (tab: Tab) => AgentState,
  markUnread: (label: string) => void,
): void {
  finishRunningTab(tabs, label, output, deleteBusy, persist, buildAgentState, markUnread);
}

export function capToConfiguredMax(log: LogEntry[], maxLines: number): LogEntry[] {
  return capLog(log, maxLines);
}

export function append(
  tabs: Tab[], label: string, entry: LogEntry, cap: (log: LogEntry[]) => LogEntry[],
  activeLabel: string | undefined, secondaryTabLabel: string | undefined,
): void {
  appendTab(tabs, label, entry, cap, (target) => markUnreadTab(tabs, target, activeLabel, secondaryTabLabel));
}

export function clearTranscript(
  tabs: Tab[], label: string, persist: (state: AgentState) => void,
  buildAgentState: (tab: Tab) => AgentState,
): void {
  clearTranscriptTab(tabs, label, persist, buildAgentState);
}

export function recordHistoryForTab(tab: Tab, text: string): string {
  return recordHistory(tab, text);
}
