import path from 'node:path';
import { openerForExtension } from '../openers/index.js';
import type { FileOpenerResolution } from '../protocol.js';

// `FileNavigatorManager.openers`, extracted whole to keep manager.ts under the file-size guideline.
// Decides what activating one row should do: a file type the opener registry claims goes straight
// to `open`/`edit`; anything else offers the two fallbacks the client renders as a chooser.
// A video row inverts the edit gesture: a binary video has nothing to edit as text, so shift
// activation hands it to the configured external player instead of the plain-text editor.
export function openersForRow(
  root: string, relPath: string, edit: boolean,
): FileOpenerResolution {
  const opener = openerForExtension(path.extname(path.resolve(root, relPath)));
  if (opener?.name === 'video') return { command: edit ? 'open external' : 'open', choices: [] };
  if (opener) return { command: edit ? 'edit' : 'open', choices: [] };
  return {
    choices: [
      { label: 'Edit as text', command: 'edit' },
      { label: 'Open externally', command: 'open external' },
    ],
  };
}
