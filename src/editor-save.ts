import { statSync, writeFileSync } from 'node:fs';
import { humanSize } from './openers/size.js';
import { messageBus } from './bus.js';
import type { Managers } from './managers.js';

// Write an editor tab's buffer back to disk. `url` is the tab's `/open/<id>` ref, resolved
// through the open-file allow-list — the client can only ever write to files the user explicitly
// opened. Throws on an unknown ref or a write failure; the RPC layer turns that into an error
// reply for the client's save feedback.
export function saveFile(managers: Managers, url: string, content: string): void {
  const id = url.startsWith('/open/') ? url.slice('/open/'.length) : '';
  const filePath = id ? managers.tab.openFilePath(id) : undefined;
  if (!filePath) throw new Error(`saveFile: unknown file ref "${url}"`);
  writeFileSync(filePath, content, 'utf8');
  // Refresh the owning tab's displayed size from the file's new on-disk size.
  const size = humanSize(statSync(filePath).size);
  const tab = managers.tab.tabs.find((t) => t.editor?.url === url);
  if (tab?.editor) tab.editor = { ...tab.editor, size };
  messageBus.emit('state', { type: 'dirty' });
}
