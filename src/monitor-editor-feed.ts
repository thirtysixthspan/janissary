import { readFileSync } from 'node:fs';
import { createPatch } from 'diff';
import type { LogEntry, MonitorTarget } from './types.js';
import type { Managers } from './managers.js';
import { resolveTargetTabs } from './monitor-targets.js';

// Cap on a single editor entry's size (first-seen full content or a subsequent diff), so one edit to
// a large file never floods a monitor with more than roughly a screenful of change.
const MAX_DIFF_BYTES = 20_000;

// Turn editor-view targets into monitor buffer entries. Editor tabs have no `LogEntry` transcript, so
// a monitor watching one instead receives that tab's file content read from disk. The first feed to a
// given monitor for a given tab is the full current content; every one after that is a unified diff
// against what was last fed to *that* monitor, emitted only when the content actually changed. Every
// entry is byte-capped (Decision 4). Non-editor targets are ignored here; they flow through the tab
// log and the `entry:appended` channel, or (for harness tabs) the harness feed.
export function editorFeedEntries(
  managers: Managers,
  targets: MonitorTarget[],
  editorSeen: Map<string, string>,
): { tabLabel: string; entry: LogEntry }[] {
  const entries: { tabLabel: string; entry: LogEntry }[] = [];
  for (const tab of resolveTargetTabs(managers.tab.tabs, targets)) {
    if (tab.view !== 'editor' || !tab.editor) continue;
    const filePath = resolveOpenFilePath(managers, tab.editor.url);
    if (!filePath) continue;
    const current = readContent(filePath);
    const previous = editorSeen.get(tab.label);
    editorSeen.set(tab.label, current);
    if (previous === undefined) {
      if (current !== '') entries.push({ tabLabel: tab.label, entry: { input: '', output: cap(current) } });
      continue;
    }
    if (previous === current) continue;
    entries.push({ tabLabel: tab.label, entry: { input: '', output: cap(createPatch(tab.editor.name, previous, current)) } });
  }
  return entries;
}

// Resolve an editor tab's `/open/<id>` ref to its on-disk path through the same allow-list
// `editor-save.ts` uses. Returns undefined for an id that no longer resolves (skip that tab).
function resolveOpenFilePath(managers: Managers, url: string): string | undefined {
  const id = url.startsWith('/open/') ? url.slice('/open/'.length) : '';
  return id ? managers.tab.openFilePath(id) : undefined;
}

// Read the file, treating a missing/unreadable file as empty content (Decision 8): a never-saved new
// file contributes nothing, and a deleted file reads as `''`, yielding a diff that removes every line.
function readContent(filePath: string): string {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

// Truncate to MAX_DIFF_BYTES plus a trailing note; content within the cap is returned unchanged.
function cap(text: string): string {
  const totalBytes = Buffer.byteLength(text, 'utf8');
  if (totalBytes <= MAX_DIFF_BYTES) return text;
  const head = Buffer.from(text, 'utf8').subarray(0, MAX_DIFF_BYTES).toString('utf8');
  return `${head}\n… diff truncated (${totalBytes} bytes total)`;
}
