import type { Tab, LogEntry } from '../types.js';

// Pure per-tab transcript mutations. Everything here takes a log (or a tab) and returns or
// rewrites data — side effects (messageBus emits, persistence, unread-marking) are the caller's
// responsibility and live in transcript-events.ts.

// Caps a log to at most `max` entries, dropping the oldest. Shared by every mutation that grows a
// tab's log (append) or resumes one rehydrated from disk (TabManager.rehydrate).
export function capLog(log: LogEntry[], max: number): LogEntry[] {
  return log.length > max ? log.slice(log.length - max) : log;
}

// Marks the most recent still-running log entry (if any) as finished with `output`. Returns the
// same log reference when nothing was running.
export function finishRunningEntry(log: LogEntry[], output: string): LogEntry[] {
  const index = log.findLastIndex((e) => e.running);
  if (index === -1) return log;
  const next = [...log];
  next[index] = { ...next[index], output, running: false };
  return next;
}

export function appendEntry(tab: Tab, entry: LogEntry, capLogFn: (log: LogEntry[]) => LogEntry[]): number {
  const before = tab.log.length;
  tab.log = capLogFn([...tab.log, entry]);
  tab.scrollOffset = 0;
  return before + 1 - tab.log.length;
}

export function finishEntry(tab: Tab, output: string): void {
  tab.log = finishRunningEntry(tab.log, output);
}

export function clearLog(tab: Tab): void {
  tab.log = [];
}
