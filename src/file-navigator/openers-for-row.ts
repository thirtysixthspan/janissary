import path from 'node:path';
import { openerForExtension } from '../openers/index.js';
import type { FileOpenerChoice } from '../protocol.js';

// `FileNavigatorManager.openers`, extracted whole to keep manager.ts under the file-size guideline.
// Decides what activating one row should do: a file type the opener registry claims goes straight
// to `open`/`edit`; anything else offers the two fallbacks the client renders as a chooser.
export function openersForRow(
  root: string, relPath: string, edit: boolean,
): { command?: 'open' | 'edit'; choices: FileOpenerChoice[] } {
  const opener = openerForExtension(path.extname(path.resolve(root, relPath)));
  if (opener) return { command: edit ? 'edit' : 'open', choices: [] };
  return {
    choices: [
      { label: 'Edit as text', command: 'edit' },
      { label: 'Open externally', command: 'open external' },
    ],
  };
}
