import type { LogEntry, MonitorTarget } from '../types.js';
import type { Managers } from '../managers.js';
import { resolveTargetTabs } from './targets.js';
import { diffFeedEntry } from './feed-diff.js';

// Cap on a single page entry's size (first-seen full content or a subsequent diff), matching the
// editor feed's cap so one page's visible text never floods a monitor with more than roughly a
// screenful of change.
const MAX_PAGE_BYTES = 20_000;

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
    const entry = diffFeedEntry(pageSeen, tab.label, current, tab.page?.domain ?? tab.label, cap);
    if (entry) entries.push(entry);
  }
  return entries;
}

// Truncate to MAX_PAGE_BYTES plus a trailing note; content within the cap is returned unchanged.
function cap(text: string): string {
  const totalBytes = Buffer.byteLength(text, 'utf8');
  if (totalBytes <= MAX_PAGE_BYTES) return text;
  const head = Buffer.from(text, 'utf8').subarray(0, MAX_PAGE_BYTES).toString('utf8');
  return `${head}\n… diff truncated (${totalBytes} bytes total)`;
}
