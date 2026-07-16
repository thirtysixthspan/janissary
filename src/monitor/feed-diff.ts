import { createPatch } from 'diff';
import type { LogEntry } from '../types.js';

// Builds the diff-or-full-snapshot entry shared by the editor and page feeds: the first feed for a
// given tab is its full (capped) content, every one after that is a capped unified diff against what
// was last fed to that monitor. Returns undefined when there is nothing new to report.
export function diffFeedEntry(
  seen: Map<string, string>,
  label: string,
  current: string,
  patchName: string,
  cap: (text: string) => string,
): { tabLabel: string; entry: LogEntry } | undefined {
  const previous = seen.get(label);
  seen.set(label, current);
  if (previous === undefined) {
    return current === '' ? undefined : { tabLabel: label, entry: { input: '', output: cap(current) } };
  }
  if (previous === current) return undefined;
  return { tabLabel: label, entry: { input: '', output: cap(createPatch(patchName, previous, current)) } };
}
