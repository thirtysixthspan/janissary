import type { LogEntry, MonitorTarget } from '../tab/types.js';
import type { Managers } from '../managers.js';
import { currentEditorContent } from '../editor/content.js';
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
    const current = currentEditorContent(managers, tab.editorDraft, tab.editor.url);
    if (current === undefined) continue;
    const entry = diffFeedEntry(editorSeen, tab.label, current, tab.editor.name);
    if (entry) entries.push(entry);
  }
  return entries;
}


