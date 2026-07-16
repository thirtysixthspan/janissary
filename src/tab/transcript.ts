import type { LogEntry } from '../types.js';

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
