import type { LogEntry, MonitorTarget } from '../tab/types.js';
import type { Managers } from '../managers.js';
import { resolveTargetTabs } from './targets.js';
import { diffFeedEntry } from './feed-diff.js';

// Turn snapshot-carrying plugin targets into monitor buffer entries. A plugin tab has no `LogEntry`
// transcript, so a monitor watching one instead receives whatever text that plugin has volunteered
// through the `snapshotTab` capability — for the embedded page plugin, the text currently visible in
// its viewport. It is read synchronously from the per-tab cache rather than from the DOM, because
// the flush this feeds is synchronous. The first feed to a given monitor for a given tab is the full
// current content; every one after that is a unified diff against what was last fed to *that*
// monitor, emitted only when the content actually changed. Every entry is byte-capped. A target that
// has volunteered nothing contributes nothing.
export function pageFeedEntries(
  managers: Managers,
  targets: MonitorTarget[],
  pageSeen: Map<string, string>,
): { tabLabel: string; entry: LogEntry }[] {
  const entries: { tabLabel: string; entry: LogEntry }[] = [];
  for (const tab of resolveTargetTabs(managers.tab.tabs, targets)) {
    if (!tab.pageSnapshot) continue;
    const current = tab.pageSnapshot.text;
    const entry = diffFeedEntry(pageSeen, tab.label, current, tab.title ?? tab.label);
    if (entry) entries.push(entry);
  }
  return entries;
}


