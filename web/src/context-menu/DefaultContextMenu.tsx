import React from 'react';
import type { JanusClient } from '../shared/ws/ws';
import { ContextMenu } from '../shared/ContextMenu';
import { defaultMenuGroups } from './default-menu-target';
import { pasteInto } from './clipboard-commands';
import { copyText } from '../shared/system-clipboard';
import { clearTerminalSelection } from '../shared/terminal/terminal/selection';
import { useDefaultContextMenu } from './useDefaultContextMenu';
import { selectionEntries } from './selection-entries';

// The app's fallback right-click menu, mounted once by the shell. It draws Copy, Paste, and Paste from
// clipboard for any surface that defines no menu of its own — an editor tab, a terminal, the command
// bar — in the same visual language as the file navigator's, which keeps its own menu because it
// defines one.
//
// Entries that act on the selection render as one group after Copy, Paste, and Paste from clipboard:
// Open this URL when the selection is a web address, then whatever plugins contribute, which arrives
// while the menu is open and keeps the order the server gave it.
export function DefaultContextMenu({ client }: { client?: JanusClient }) {
  const {
    pending, contributed, runContributed, openUrl, pasteFromClipboard, close,
  } = useDefaultContextMenu(client);
  if (!pending) return null;

  const groups = defaultMenuGroups(pending, {
    // A terminal-sourced pick releases itself once it's been copied, the same way the copy chord
    // does — a dom or editor selection is the browser's own and stays exactly where it was.
    copy: (text) => {
      copyText(text);
      if (pending.selectionSource === 'terminal') clearTerminalSelection(pending.restoreFocus);
    },
    paste: (element) => { void pasteInto(element); },
    pasteFromClipboard,
  });
  const selectionGroup = selectionEntries(pending.selectionText, contributed, { openUrl, runContributed });
  if (selectionGroup.length > 0) groups.push(selectionGroup);
  if (groups.length === 0) return null;

  return <ContextMenu groups={groups} x={pending.x} y={pending.y} onClose={close} />;
}
