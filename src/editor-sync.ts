import type { Managers } from './managers.js';

// Cache an editor tab's in-progress (unsaved) buffer as transient draft state on the tab. `url`
// is the tab's `/open/<id>` ref, matched the same way saveFile's handler resolves its tab — but
// unlike saveFile this never touches the filesystem or the open-file allow-list; it only writes
// the in-memory `editorDraft`. An unresolvable `url` (e.g. a tab closed mid-debounce) is a no-op,
// never an error.
export function syncEditorBuffer(managers: Managers, url: string, content: string): void {
  const tab = managers.tab.tabs.find((t) => t.editor?.url === url);
  if (tab) tab.editorDraft = { content, updatedAt: Date.now() };
}
