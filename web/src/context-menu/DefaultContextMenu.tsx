import React from 'react';
import { ContextMenu } from '../shared/ContextMenu';
import { defaultMenuGroups } from './default-menu-target';
import { pasteInto } from './clipboard-commands';
import { copyText } from '../shared/system-clipboard';
import { useDefaultContextMenu } from './useDefaultContextMenu';

// The app's fallback right-click menu, mounted once by the shell. It draws Copy and Paste for any
// surface that defines no menu of its own — an editor tab, a terminal, the command bar — in the
// same visual language as the file navigator's, which keeps its own menu because it defines one.
export function DefaultContextMenu() {
  const { pending, close } = useDefaultContextMenu();
  if (!pending) return null;

  const groups = defaultMenuGroups(pending, {
    copy: copyText,
    paste: (element) => { void pasteInto(element); },
  });
  if (groups.length === 0) return null;

  return <ContextMenu groups={groups} x={pending.x} y={pending.y} onClose={close} />;
}
