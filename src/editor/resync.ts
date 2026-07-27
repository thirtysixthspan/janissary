import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

// Manually re-run a synced editor tab's pull-only sync cycle (the `resyncEditorTab` RPC) — the
// same `openSync` `openFileManager.ts` already runs when a synced tab opens. `editorWatch.refresh`
// checks for and reports any resulting on-disk change immediately and re-arms the watcher, rather
// than waiting on an `fs.watch` event a git-driven replace may not deliver — its conflict-vs-clean-
// reload handling (`useEditorWatchReload` on the client) then runs exactly like an external edit.
export async function resyncEditorTab(managers: Managers, url: string): Promise<void> {
  const tab = managers.tab.tabs.find((t) => t.editor?.url === url);
  const sync = tab?.editor?.sync;
  if (!tab?.editor || !sync || sync === 'provisioning' || sync === 'syncing') return;
  tab.editor = { ...tab.editor, sync: 'syncing' };
  messageBus.emit('state', { type: 'dirty' });
  const result = await managers.gitSync.openSync();
  const freshTab = managers.tab.tabs.find((t) => t.label === tab.label);
  if (!freshTab?.editor) return;
  freshTab.editor = { ...freshTab.editor, sync: 'error' in result ? 'error' : 'synced' };
  if (!('error' in result)) managers.editorWatch.refresh(freshTab.label);
  messageBus.emit('state', { type: 'dirty' });
}
