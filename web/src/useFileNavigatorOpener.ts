import { useState } from 'react';
import type React from 'react';
import type { FileOpenerChoice, FileOpenerResolution } from '@shared/protocol';
import type { JanusClient } from './ws';

export type PendingOpeners = { path: string; paths: string[]; choices: FileOpenerChoice[]; selected: number };

export function useFileNavigatorOpener(client: JanusClient, index: number, root: string) {
  const [pending, setPending] = useState<PendingOpeners | null>(null);

  const open = (path: string, edit: boolean) => {
    if (typeof client.request !== 'function') {
      client.send({ method: 'command', params: { text: `${edit ? 'edit' : 'open'} ${root}/${path}` } });
      return;
    }
    void client.request<FileOpenerResolution>({
      method: 'fileNavigatorOpeners', params: { index, relPath: path, edit },
    }).then((result) => {
      if (result?.command) client.send({ method: 'command', params: { text: `${result.command} ${root}/${path}` } });
      else if (result?.choices.length) setPending({ path, paths: [path], choices: result.choices, selected: 0 });
    });
  };

  // The row context menu's "Open with": always show the chooser, even for a file whose extension a
  // registered opener claims and would normally open straight away. A client with no request
  // support has no chooser to show, so it falls back to the plain open command the way `open` does.
  const openWith = (path: string, paths = [path]) => {
    if (typeof client.request !== 'function') {
      client.send({ method: 'command', params: { text: `open ${root}/${path}` } });
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
      for (const path of pending.paths) client.send({ method: 'command', params: { text: `edit ${root}/${path}` } });
    } else if (choice) client.send({ method: 'command', params: { text: `${choice.command} ${root}/${pending.path}` } });
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
