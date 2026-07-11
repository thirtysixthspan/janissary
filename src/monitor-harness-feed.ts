import type { LogEntry, MonitorTarget } from './types.js';
import type { Managers } from './managers.js';
import { resolveTargetTabs } from './monitor-targets.js';

// Turn harness-view targets into monitor buffer entries. Harness tabs have no `LogEntry` transcript,
// so a monitor watching one instead receives that tab's latest rendered screen (the coherent,
// de-ANSI'd text the screen reader already computes) as a `LogEntry` tagged with the tab label.
// Entries are emitted only when the capture is newer than the last one fed for that tab (deduped by
// `capturedAt`), so an idle harness — whose screen reader keeps returning the same capture — never
// re-prompts the monitor. Non-harness targets are ignored here; they flow through the tab log and
// the `entry:appended` channel instead.
export function harnessFeedEntries(
  managers: Managers,
  targets: MonitorTarget[],
  harnessSeen: Map<string, number>,
): { tabLabel: string; entry: LogEntry }[] {
  const entries: { tabLabel: string; entry: LogEntry }[] = [];
  for (const tab of resolveTargetTabs(managers.tab.tabs, targets)) {
    if (tab.view !== 'harness') continue;
    const latest = managers.harness.latestScreenText(tab.label);
    if (!latest || harnessSeen.get(tab.label) === latest.capturedAt) continue;
    harnessSeen.set(tab.label, latest.capturedAt);
    entries.push({ tabLabel: tab.label, entry: { input: '', output: latest.text } });
  }
  return entries;
}
