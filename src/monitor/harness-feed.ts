import type { LogEntry, MonitorTarget } from '../tab/types.js';
import type { Managers } from '../managers.js';
import { resolveTargetTabs } from './targets.js';

// Box-drawing borders and Braille spinner glyphs: visual TUI chrome the three supported harnesses
// render for panels/progress, carrying no information for a model reading the screen as data.
const DECORATIVE_CHARS = /[─-╿⠀-⣿]/g;

// Strips decorative TUI chrome from a rendered harness screen and collapses the adjacent blank/
// duplicate lines that stripping it leaves behind (e.g. a box's border rows become blank once their
// characters are removed, and several in a row collapse to one). Only ever merges *adjacent*
// blanks/duplicates — a line repeated far away in the screen (a shell prompt shown twice after two
// separate commands) is left alone, since that repetition may be meaningful.
export function compressScreenText(text: string): string {
  const lines = text.split('\n').map((line) => line.replaceAll(DECORATIVE_CHARS, '').replace(/\s+$/, ''));
  const kept: string[] = [];
  for (const line of lines) {
    const previous = kept.at(-1);
    if (line === '' && previous === '') continue;
    if (line !== '' && line === previous) continue;
    kept.push(line);
  }
  return kept.join('\n');
}

// Turn harness-view targets into monitor buffer entries. Harness tabs have no `LogEntry` transcript,
// so a monitor watching one instead receives that tab's latest rendered screen (the coherent,
// de-ANSI'd text the screen reader already computes), compressed to drop decorative chrome and the
// repetition it leaves behind, as a `LogEntry` tagged with the tab label. Entries are emitted only
// when the capture is newer than the last one fed for that tab (deduped by `capturedAt`, checked
// against the raw capture so compression never affects dedup), so an idle harness — whose screen
// reader keeps returning the same capture — never re-prompts the monitor. Non-harness targets are
// ignored here; they flow through the tab log and the `entry:appended` channel instead.
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
    entries.push({ tabLabel: tab.label, entry: { input: '', output: compressScreenText(latest.text) } });
  }
  return entries;
}
