import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { TAB_RENAME_MAX_LENGTH } from '../config.js';
import { notify } from '../notifications/index.js';
import { renameEditorTab } from '../tab/rename-editor.js';

// Rename an editor tab's file, addressed by the tab's `/open/<id>` ref the way saveFile is.
// The strip's renameTab RPC is keyed by tab-array index, which the persistent editor body does
// not know, while the metadata row's rename input only ever knows `editor.url`. Delegates to the
// same tab-rename logic the strip path uses, then persists and rebroadcasts. A refused rename
// posts a file-operation notification instead of persisting.
export function renameEditorFile(managers: Managers, url: string, name: string): void {
  const tab = managers.tab.editorTabByUrl(url);
  if (!tab?.editor) return;
  const refusal = renameEditorTab(
    tab, name, TAB_RENAME_MAX_LENGTH,
    (reference, absPath) => managers.tab.replaceFile(reference, absPath),
    (label, filePath) => managers.editorWatch.watch(label, filePath),
  );
  if (refusal) notify(managers, 'file-operation', tab.label, refusal);
  else managers.tab.persist(managers.tab.buildAgentState(tab));
  messageBus.emit('state', { type: 'dirty' });
}
