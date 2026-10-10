import { readFileSync } from 'node:fs';
import type { Managers } from '../managers.js';

// Resolve an editor's live content from its acknowledged unsaved draft or its registered file ref.
// The host's file-ref lookup keeps this read inside the same allow-list as the editor itself.
export function currentEditorContent(
  managers: Managers,
  draft: { content: string } | undefined,
  url: string,
): string | undefined {
  if (draft) return draft.content;
  const id = url.startsWith('/open/') ? url.slice('/open/'.length) : '';
  const filePath = id ? managers.tab.openFilePath(id) : undefined;
  if (!filePath) return undefined;
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}
