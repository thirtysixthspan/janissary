import type { LogEntry, Tab } from '../types.js';
import { appendTab, markUnreadTab } from './events.js';

// The tab operations under the names the tab layer speaks of them: `startRunningTab` says what a
// function does to a `Tab[]`, `startRunning` says what it means to a tab. Most of this module is
// therefore that naming and nothing else, and it is re-exported rather than wrapped — a wrapper that
// only forwards restates the whole parameter list, which is duplication with no behaviour in it.
// `append` below is the one that earns a body: it is the only operation here that has to wire a step
// the underlying function does not take.
export {
  startRunningTab as startRunning,
  finishRunningTab as finishRunning,
  updateRunningEntry as updateRunning,
  clearTranscriptTab as clearTranscript,
  type RunningEntryFields,
  type RunningEntryMatch,
  type UpdateRunningHooks,
} from './events.js';
export { capLog as capToConfiguredMax } from './log.js';
export { recordHistory as recordHistoryForTab } from '../history.js';

export function append(
  tabs: Tab[], label: string, entry: LogEntry, cap: (log: LogEntry[]) => LogEntry[],
  activeLabel: string | undefined, secondaryTabLabel: string | undefined,
): void {
  appendTab(tabs, label, entry, cap, (target) => markUnreadTab(tabs, target, activeLabel, secondaryTabLabel));
}
