import { setClipboard } from './file-navigator-clipboard';
import { joinEditorPaths } from './file-navigator-relative-path';
import { copyText } from '../shared/system-clipboard';

// Copying rows fills both clipboards at once. The app-wide file clipboard is what the navigator's
// own Paste, the row marks, and the undo stack read; the system clipboard carries the same rows as
// text, so the selection can be pasted straight into an editor buffer or any other text field.
// Both writes happen here so the keyboard chord and the row context menu can never drift apart.
//
// Cut is deliberately not routed through this: a cut is a pending move, and text on the system
// clipboard would invite a paste that does nothing about it.
export function copySelectionToClipboards(
  absoluteRoot: string,
  relPaths: string[],
  remoteHost?: string,
): void {
  if (relPaths.length === 0) return;
  setClipboard('copy', relPaths.map((relPath) => `${absoluteRoot}/${relPath}`), remoteHost);
  copyText(joinEditorPaths(absoluteRoot, relPaths, remoteHost));
}
