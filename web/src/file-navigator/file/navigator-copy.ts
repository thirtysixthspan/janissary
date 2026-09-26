import { setClipboard } from './navigator-clipboard';
import { joinEditorPaths, remoteNavigatorPath } from './navigator-relative-path';
import { copyText } from '../../shared/system-clipboard';

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

// Copying a row's location writes the paste buffer alone: a path is text for another app or
// tab, not a pending duplicate, so neither the file clipboard nor the row marks move. A remote
// tree keeps the host-qualified form, since the bare local path would resolve to nothing where
// the text is pasted.
export function copyAbsolutePaths(
  absoluteRoot: string,
  relPaths: string[],
  remoteHost?: string,
): void {
  if (relPaths.length === 0) return;
  const paths = remoteHost
    ? relPaths.map((relPath) => remoteNavigatorPath(remoteHost, absoluteRoot, relPath))
    : relPaths.map((relPath) => `${absoluteRoot}/${relPath}`);
  copyText(paths.join('\n'));
}
