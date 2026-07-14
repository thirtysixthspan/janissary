import type { Managers } from '../managers.js';

// Cache a page tab's currently visible text as transient snapshot state on the tab, relayed by the
// bundled extension's content script. `url` is the tab's `page.url`, matched the same way
// `syncEditorBuffer` resolves its tab — this never touches the filesystem or is sent to any client,
// it only writes the in-memory `pageSnapshot`. An unresolvable `url` (e.g. a tab closed mid-relay)
// is a no-op, never an error.
export function syncPageSnapshot(managers: Managers, url: string, text: string): void {
  const tab = managers.tab.tabs.find((t) => t.page?.url === url);
  if (tab) tab.pageSnapshot = { text, capturedAt: Date.now() };
}
