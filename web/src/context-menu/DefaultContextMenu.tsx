import React from 'react';
import type { JanusClient } from '../ws';
import { ContextMenu } from '../shared/ContextMenu';
import { defaultMenuGroups } from './default-menu-target';
import { pasteInto } from './clipboard-commands';
import { copyText } from '../shared/system-clipboard';
import { clearTerminalSelection } from '../shared/terminal/terminal-selection';
import { useDefaultContextMenu } from './useDefaultContextMenu';

// The app's fallback right-click menu, mounted once by the shell. It draws Copy and Paste for any
// surface that defines no menu of its own — an editor tab, a terminal, the command bar — in the
// same visual language as the file navigator's, which keeps its own menu because it defines one.
//
// When a plugin contributes an entry for the selection, it arrives while the menu is open and
// renders as its own group after Copy and Paste.
export function DefaultContextMenu({ client }: { client?: JanusClient }) {
  const { pending, contributed, runContributed, close } = useDefaultContextMenu(client);
  if (!pending) return null;

  const groups = defaultMenuGroups(pending, {
    // A terminal-sourced pick releases itself once it's been copied, the same way the copy chord
    // does — a dom or editor selection is the browser's own and stays exactly where it was.
    copy: (text) => {
      copyText(text);
      if (pending.selectionSource === 'terminal') clearTerminalSelection(pending.restoreFocus);
    },
    paste: (element) => { void pasteInto(element); },
  });
  if (contributed) {
    groups.push([{ label: contributed.label, onActivate: runContributed }]);
  }
  if (groups.length === 0) return null;

  return <ContextMenu groups={groups} x={pending.x} y={pending.y} onClose={close} />;
}
