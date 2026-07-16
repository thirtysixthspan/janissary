import { readFileSync } from 'node:fs';
import type { LogEntry, MonitorTarget } from '../types.js';
import type { Managers } from '../managers.js';
import { resolveTargetTabs } from './targets.js';
import { diffFeedEntry } from './feed-diff.js';

// Turn editor-view targets into monitor buffer entries. Editor tabs have no `LogEntry` transcript, so
// a monitor watching one instead receives that tab's current content: the live unsaved draft when one
// is present, or the file read from disk otherwise. The first feed to a given monitor for a given tab
// is the full current content; every one after that is a unified diff against what was last fed to
// *that* monitor, emitted only when the content actually changed. Every entry is byte-capped
// (Decision 4). Non-editor targets are ignored here; they flow through the tab log and the
// `entry:appended` channel, or (for harness tabs) the harness feed.
export function editorFeedEntries(
  managers: Managers,
  targets: MonitorTarget[],
  editorSeen: Map<string, string>,
): { tabLabel: string; entry: LogEntry }[] {
  const entries: { tabLabel: string; entry: LogEntry }[] = [];
  for (const tab of resolveTargetTabs(managers.tab.tabs, targets)) {
    if (tab.view !== 'editor' || !tab.editor) continue;
    const current = currentContent(managers, tab.editorDraft, tab.editor.url);
    if (current === undefined) continue;
    const entry = diffFeedEntry(editorSeen, tab.label, current, tab.editor.name);
    if (entry) entries.push(entry);
  }
  return entries;
}

// Resolve an editor tab's current content: the live unsaved draft when present, otherwise the file
// read from disk. Returns undefined only when there is no draft and the `/open/<id>` ref no longer
// resolves, meaning the tab should be skipped entirely.
function currentContent(managers: Managers, draft: { content: string } | undefined, url: string): string | undefined {
  if (draft) return draft.content;
  const filePath = resolveOpenFilePath(managers, url);
  return filePath ? readContent(filePath) : undefined;
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


