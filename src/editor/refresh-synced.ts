import type { Managers } from '../managers.js';

// Every synced file lives in the one shared git-sync clone, so any pull into it — a synced tab
// opening, another tab's save cycle, a manual resync — may have rewritten any open synced tab's
// file. Re-check each of them now rather than trusting an `fs.watch` event a git-driven replace
// can miss: a clean tab reloads, and a dirty one gets the overwrite prompt on its next save.
export function refreshSyncedTabs(managers: Managers): void {
  for (const tab of managers.tab.tabs) {
    if (tab.editor?.sync) managers.editorWatch.refresh(tab.label);
  }
}
