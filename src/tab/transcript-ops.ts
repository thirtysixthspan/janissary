import type { Tab, LogEntry } from '../types.js';
import { finishRunningEntry } from './transcript.js';

// Pure per-tab log mutations extracted from TabManager. Side effects — messageBus emits,
// persistence, unread-marking — stay the caller's responsibility.

export function appendEntry(tab: Tab, entry: LogEntry, capLog: (log: LogEntry[]) => LogEntry[]): number {
  const before = tab.log.length;
  tab.log = capLog([...tab.log, entry]);
  tab.scrollOffset = 0;
  return before + 1 - tab.log.length;
}

export function finishEntry(tab: Tab, output: string): void {
  tab.log = finishRunningEntry(tab.log, output);
}

export function clearLog(tab: Tab): void {
  tab.log = [];
}
