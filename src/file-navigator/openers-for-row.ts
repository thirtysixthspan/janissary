import path from 'node:path';
import { openerForExtension } from '../openers/index.js';
import type { FileOpenerResolution } from '../protocol.js';

// `FileNavigatorManager.openers`, extracted whole to keep manager.ts under the file-size guideline.
// Decides what activating one row should do: a file type the opener registry claims goes straight
// to `open`/`edit`; anything else offers the two fallbacks the client renders as a chooser.
// An opener may invert the edit gesture by declaring one — a binary format has nothing to edit as
// text, so shift activation hands the file to its external handler instead of the plain-text editor.
// The gesture comes from the opener's own declaration rather than from a name core recognizes, so a
// bundled tab plugin claiming an extension gets the same behavior without core knowing what it is.
export function openersForRow(
  root: string, relPath: string, edit: boolean,
): FileOpenerResolution {
  const opener = openerForExtension(path.extname(path.resolve(root, relPath)));
  if (opener?.editGesture) return { command: edit ? opener.editGesture : 'open', choices: [] };
  if (opener) return { command: edit ? 'edit' : 'open', choices: [] };
  return {
    choices: [
      { label: 'Edit as text', command: 'edit' },
      { label: 'Open externally', command: 'open external' },
    ],
  };
}
