import React from 'react';
import type { JanusClient } from '../shared/ws/ws';
import { ContextMenu } from '../shared/ContextMenu';
import { defaultMenuGroups } from './default-menu-target';
import { pasteInto } from './clipboard-commands';
import { copyText } from '../shared/system-clipboard';
import { clearTerminalSelection } from '../shared/terminal/terminal/selection';
import { useDefaultContextMenu } from './useDefaultContextMenu';

// The app's fallback right-click menu, mounted once by the shell. It draws Copy, Paste, and Paste from
// clipboard for any surface that defines no menu of its own — an editor tab, a terminal, the command
// bar — in the same visual language as the file navigator's, which keeps its own menu because it
// defines one.
//
// When plugins contribute entries for the selection, they arrive while the menu is open and render,
// in the order the server gave them, as one group after Copy, Paste, and Paste from clipboard.
export function DefaultContextMenu({ client }: { client?: JanusClient }) {
  const { pending, contributed, runContributed, pasteFromClipboard, close } = useDefaultContextMenu(client);
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
  if (contributed.length > 0) {
    groups.push(contributed.map(({ label }) => ({ label, onActivate: () => { runContributed(label); } })));
  }
  if (groups.length === 0) return null;

  return <ContextMenu groups={groups} x={pending.x} y={pending.y} onClose={close} />;
}
