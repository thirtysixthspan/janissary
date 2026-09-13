import { useEffect, useRef, useState } from 'react';
import { resolveDefaultMenuTarget, type DefaultMenuTarget } from './default-menu-target';
import { terminalSelectionText } from '../shared/terminal/terminal-selection';
import type { DefaultMenuEntry } from '@shared/protocol';
import type { JanusClient } from '../ws';

export type PendingDefaultMenu = DefaultMenuTarget & { x: number; y: number };

function domSelectionText(): string {
  return globalThis.getSelection()?.toString() ?? '';
}

// Watches every right-click the app sees and decides whether the default menu answers it.
//
// A surface with a menu of its own has already called `preventDefault()` on the event by the time
// this listener runs — React dispatches at the root container, `document` is further out — so
// `defaultPrevented` is the whole test for "someone else owns this click", and no surface has to
// register anything to be left alone. When the click offers neither entry the default is left
// alone too, so the browser's own menu still appears rather than an empty box of ours.
//
// When the click also resolves a plugin-contributed entry, the label arrives while the menu is
// open: the server owns the declarations, so the client asks rather than assuming a contributor.
// A generation counter in the same shape `useSelectionAction` keeps ensures a late reply for a
// closed menu installs nothing and a reply cannot lag into the next menu.
export function useDefaultContextMenu(client?: JanusClient) {
  const [pending, setPending] = useState<PendingDefaultMenu | null>(null);
  const [contributed, setContributed] = useState<DefaultMenuEntry | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const clicked = event.target instanceof Element ? event.target : null;
      const domText = domSelectionText();
      const terminalText = domText ? '' : terminalSelectionText(clicked);
      const target = resolveDefaultMenuTarget(
        clicked, document.activeElement, domText || terminalText,
        domText ? 'dom' : terminalText ? 'terminal' : 'dom',
      );
      if (!target.selectionText && !target.pasteTarget) return;
      event.preventDefault();
      generation.current += 1;
      setContributed(null);
      const queryGeneration = generation.current;
      if (target.selectionText && typeof client?.request === 'function') {
        void client.request<DefaultMenuEntry | null>({
          method: 'defaultMenuSelectionAction', params: { selection: target.selectionText },
        }).then((entry) => {
          if (generation.current === queryGeneration) setContributed(entry ?? null);
        });
      }
      setPending({ ...target, x: event.clientX, y: event.clientY });
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, [client]);

  // The menu holds the keyboard while it is open, so whatever had focus gets it back on the way
  // out — otherwise a dismissed menu would leave the app's key handling pointed at the body.
  const close = () => {
    generation.current += 1;
    setContributed(null);
    pending?.restoreFocus?.focus();
    setPending(null);
  };

  const runContributed = () => {
    if (!contributed || !pending?.selectionText) return;
    client?.send({
      method: 'runDefaultMenuSelectionAction',
      params: { selection: pending.selectionText, action: contributed.label },
    });
    close();
  };

  return { pending, contributed, runContributed, close };
}
