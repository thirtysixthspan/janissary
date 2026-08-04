import path from 'node:path';
import { openerForExtension } from '../openers/index.js';
import type { FileOpenerChoice, FileOpenerResolution } from '../protocol.js';

// What a row with no registered opener offers, and the tail of every forced chooser.
const FALLBACK_CHOICES: FileOpenerChoice[] = [
  { label: 'Edit as text', command: 'edit' },
  { label: 'Open externally', command: 'open external' },
];

// `FileNavigatorManager.openers`, extracted whole to keep manager.ts under the file-size guideline.
// Decides what activating one row should do: a file type the opener registry claims goes straight
// to `open`/`edit`; anything else offers the two fallbacks the client renders as a chooser.
// An opener may invert the edit gesture by declaring one — a binary format has nothing to edit as
// text, so shift activation hands the file to its external handler instead of the plain-text editor.
// The gesture comes from the opener's own declaration rather than from a name core recognizes, so a
// bundled tab plugin claiming an extension gets the same behavior without core knowing what it is.
// `all` forces the chooser ("Open with" in the row's context menu): a claimed extension gives up its
// single-command shortcut and its opener's own action leads the choice list instead, labelled from
// the opener's declared name. A row no opener claims already offers exactly the fallbacks, so for
// that case a forced chooser and an ordinary one are the same list.
export function openersForRow(
  root: string, relPath: string, edit: boolean, all = false,
): FileOpenerResolution {
  const opener = openerForExtension(path.extname(path.resolve(root, relPath)));
  if (opener && all) {
    return { choices: [{ label: `Open as ${opener.name}`, command: 'open' }, ...FALLBACK_CHOICES] };
  }
  if (opener?.editGesture) return { command: edit ? opener.editGesture : 'open', choices: [] };
  if (opener) return { command: edit ? 'edit' : 'open', choices: [] };
  return { choices: [...FALLBACK_CHOICES] };
}
