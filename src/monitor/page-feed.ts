import type { LogEntry, MonitorTarget } from '../types.js';
import type { Managers } from '../managers.js';
import { resolveTargetTabs } from './targets.js';
import { diffFeedEntry } from './feed-diff.js';

// Turn page-view targets into monitor buffer entries. Page tabs have no `LogEntry` transcript, so a
// monitor watching one instead receives the text currently visible in that page's viewport, read
// synchronously from a per-tab cache (`tab.pageSnapshot`) the extension content script keeps fresh
// out of band via the `pageSync` RPC — never the DOM inline, since the flush this feeds is
// synchronous. The first feed to a given monitor for a given tab is the full current content; every
// one after that is a unified diff against what was last fed to *that* monitor, emitted only when
// the content actually changed. Every entry is byte-capped. Non-page targets are ignored here.
export function pageFeedEntries(
  managers: Managers,
  targets: MonitorTarget[],
  pageSeen: Map<string, string>,
): { tabLabel: string; entry: LogEntry }[] {
  const entries: { tabLabel: string; entry: LogEntry }[] = [];
  for (const tab of resolveTargetTabs(managers.tab.tabs, targets)) {
    if (tab.view !== 'page' || !tab.pageSnapshot) continue;
    const current = tab.pageSnapshot.text;
    const entry = diffFeedEntry(pageSeen, tab.label, current, tab.page?.domain ?? tab.label);
    if (entry) entries.push(entry);
  }
  return entries;
}


