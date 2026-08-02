import type { LogEntry, MonitorTarget } from '../tab/types.js';
import type { Managers } from '../managers.js';
import { resolveTargetTabs } from './targets.js';
import { cap } from './feed-diff.js';

// Turn harness-view targets into monitor buffer entries carrying their **session transcript** — the
// linear history extracted from the harness's own dot directory, including the subagent activity
// that never renders on the parent's terminal and so can never appear in a screen snapshot. This
// feed is additive: the same tab still contributes its rendered screen through `harnessFeedEntries`,
// which is the only thing showing its current interactive state (a permission prompt, a spinner).
//
// A target with no tailer is skipped. That is the discriminator, not `tab.harness` or
// `tab.view === 'harness'` — an ssh tab satisfies both of those while running no harness binary, and
// only a spawned harness ever gets a tailer.
export function harnessTranscriptFeedEntries(
  managers: Managers,
  targets: MonitorTarget[],
  transcriptSeen: Map<string, number>,
): { tabLabel: string; entry: LogEntry }[] {
  const entries: { tabLabel: string; entry: LogEntry }[] = [];
  for (const tab of resolveTargetTabs(managers.tab.tabs, targets)) {
    const tailer = managers.harness.transcriptTailer(tab.label);
    if (!tailer) continue;
    const seen = transcriptSeen.get(tab.label) ?? 0;
    const blocks = tailer.entriesAfter(seen);
    if (blocks.length === 0) continue;
    transcriptSeen.set(tab.label, seen + blocks.length);
    // One capped entry per tab per flush: a burst between flushes cannot blow out the prompt. The
    // persisted transcript file stays complete — this cap applies only to what reaches a monitor.
    entries.push({ tabLabel: tab.label, entry: { input: '', output: cap(blocks.join('\n\n')) } });
  }
  return entries;
}
