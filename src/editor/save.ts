import { statSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { humanSize } from '../openers/size.js';
import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { nextFreeName } from './next-free-name.js';

// Write an editor tab's buffer back to disk. `url` is the tab's `/open/<id>` ref, resolved
// through the open-file allow-list — the client can only ever write to files the user explicitly
// opened. Throws on an unknown ref or a write failure; the RPC layer turns that into an error
// reply for the client's save feedback.
export function saveFile(managers: Managers, url: string, content: string): void {
  const id = url.startsWith('/open/') ? url.slice('/open/'.length) : '';
  const filePath = id ? managers.tab.openFilePath(id) : undefined;
  if (!filePath) throw new Error(`saveFile: unknown file ref "${url}"`);
  const tab = managers.tab.tabs.find((t) => t.editor?.url === url);
  const wasNewFile = !!tab?.editor?.newFile;

  // A new-file editor's first save silently auto-suffixes instead of overwriting a same-named
  // file that another untitled tab already saved. Only the first save is eligible — `newFile`
  // clears below once the write lands, so later saves on this tab overwrite normally.
  const isFirstNewFileSave = wasNewFile && existsSync(filePath);
  const targetPath = isFirstNewFileSave ? path.join(path.dirname(filePath), nextFreeName(path.dirname(filePath), path.basename(filePath))) : filePath;

  writeFileSync(targetPath, content, 'utf8');
  // Refresh the owning tab's displayed size from the file's new on-disk size.
  const stat = statSync(targetPath);
  if (tab?.editor) {
    tab.editor = targetPath === filePath
      ? { ...tab.editor, size: humanSize(stat.size), newFile: false }
      : {
        ...tab.editor, path: targetPath, name: path.basename(targetPath),
        url: managers.tab.registerFile(targetPath), size: humanSize(stat.size), newFile: false,
      };
  }
  // The content is now canonical on disk, so any transient draft is superseded — drop it.
  if (tab) tab.editorDraft = undefined;
  if (tab && wasNewFile) {
    // The file didn't exist when the tab opened, so no watcher was ever established for it —
    // start one now that it's on disk, rather than moving a baseline that was never set.
    managers.editorWatch.watch(tab.label, targetPath);
  } else if (tab) {
    // Move the watcher's baseline forward first, so its own `fs.watch` event for this write isn't
    // mistaken for an external change.
    managers.editorWatch.markSaved(tab.label, stat.mtimeMs);
  }
  // The write and "Saved" flash above are synchronous and complete either way; a synced file's
  // git-sync cycle (commit/pull-rebase/push) only starts after, and is never awaited here, so a
  // slow or failing network sync never delays the save confirmation the user already saw.
  if (tab?.editor?.sync) {
    tab.editor = { ...tab.editor, sync: 'syncing' };
    void syncAfterSave(managers, tab.label, tab.editor.name);
  }
  messageBus.emit('state', { type: 'dirty' });
}

async function syncAfterSave(managers: Managers, label: string, filename: string): Promise<void> {
  const result = await managers.gitSync.saveSync(filename);
  const tab = managers.tab.tabs.find((t) => t.label === label);
  if (!tab?.editor) return;
  tab.editor = { ...tab.editor, sync: 'error' in result ? 'error' : 'synced' };
  messageBus.emit('state', { type: 'dirty' });
}
