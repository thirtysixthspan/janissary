import { useState } from 'react';
import type React from 'react';
import type { FileOpenerChoice, FileOpenerResolution } from '@shared/protocol';
import type { JanusClient } from '../ws';

export type PendingOpeners = { path: string; paths: string[]; choices: FileOpenerChoice[]; selected: number };

export function useFileNavigatorOpener(client: JanusClient, index: number) {
  const [pending, setPending] = useState<PendingOpeners | null>(null);

  const open = (path: string, edit: boolean) => {
    if (typeof client.request !== 'function') {
      sendOpen(client, index, path, edit ? 'edit' : 'open');
      return;
    }
    void client.request<FileOpenerResolution>({
      method: 'fileNavigatorOpeners', params: { index, relPath: path, edit },
    }).then((result) => {
      if (result?.command) sendOpen(client, index, path, result.command);
      else if (result?.choices.length) setPending({ path, paths: [path], choices: result.choices, selected: 0 });
    });
  };

  // The row context menu's "Open with": always show the chooser, even for a file whose extension a
  // registered opener claims and would normally open straight away. A client with no request
  // support has no chooser to show, so it falls back to the plain open the way `open` does.
  const openWith = (path: string, paths = [path]) => {
    if (typeof client.request !== 'function') {
      sendOpen(client, index, path, 'open');
      return;
    }
    void client.request<FileOpenerResolution>({
      method: 'fileNavigatorOpeners', params: { index, relPath: path, edit: false, all: true },
    }).then((result) => {
      if (result?.choices.length) setPending({ path, paths, choices: result.choices, selected: 0 });
    });
  };

  const choose = (choiceIndex: number) => {
    if (!pending) return;
    const choice = pending.choices[choiceIndex];
    if (choice?.command === 'edit') {
      for (const path of pending.paths) sendOpen(client, index, path, 'edit');
    } else if (choice) sendOpen(client, index, pending.path, choice.command);
    setPending(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!pending) return false;
    switch (e.key) {
      case 'ArrowUp': { e.preventDefault(); setPending({ ...pending, selected: Math.max(0, pending.selected - 1) }); break; }
      case 'ArrowDown': { e.preventDefault(); setPending({ ...pending, selected: Math.min(pending.choices.length - 1, pending.selected + 1) }); break; }
      case 'Enter': { e.preventDefault(); choose(pending.selected); break; }
      case 'Escape': { e.preventDefault(); setPending(null); break; }
      default: { return true; }
    }
    return true;
  };

  return { pending, open, openWith, choose, onKeyDown };
}

// Every open and edit travels as the navigator-scoped RPC: the server resolves the tab index to
// the navigator's own label and root, so no command is issued, nothing lands in any tab's
// transcript or command history, and a busy agent never queues the request.
function sendOpen(
  client: JanusClient, index: number, path: string,
  command: FileOpenerChoice['command'],
): void {
  client.send({ method: 'fileNavigatorOpen', params: { index, relPath: path, command } });
}
