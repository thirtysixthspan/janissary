import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';

// Manually re-run a synced editor tab's pull-only sync cycle (the `resyncEditorTab` RPC) — the
// same `openSync` `openFileManager.ts` already runs when a synced tab opens. Any resulting on-disk
// change is picked up by the existing file watcher exactly like an external edit, including its
// conflict-vs-clean-reload handling (`useEditorWatchReload` on the client); this only needs to run
// the pull and reflect the tab's `sync` status, mirroring `syncAfterSave` in `./save.ts`.
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
  messageBus.emit('state', { type: 'dirty' });
}
