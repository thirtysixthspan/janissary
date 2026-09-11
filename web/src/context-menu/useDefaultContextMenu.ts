import { useEffect, useState } from 'react';
import { resolveDefaultMenuTarget, type DefaultMenuTarget } from './default-menu-target';

export type PendingDefaultMenu = DefaultMenuTarget & { x: number; y: number };

function selectedText(): string {
  return globalThis.getSelection()?.toString() ?? '';
}

// Watches every right-click the app sees and decides whether the default menu answers it.
//
// A surface with a menu of its own has already called `preventDefault()` on the event by the time
// this listener runs — React dispatches at the root container, `document` is further out — so
// `defaultPrevented` is the whole test for "someone else owns this click", and no surface has to
// register anything to be left alone. When the click offers neither entry the default is left
// alone too, so the browser's own menu still appears rather than an empty box of ours.
export function useDefaultContextMenu() {
  const [pending, setPending] = useState<PendingDefaultMenu | null>(null);

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const clicked = event.target instanceof Element ? event.target : null;
      const target = resolveDefaultMenuTarget(clicked, document.activeElement, selectedText());
      if (!target.selectionText && !target.pasteTarget) return;
      event.preventDefault();
      setPending({ ...target, x: event.clientX, y: event.clientY });
    };
    document.addEventListener('contextmenu', onContextMenu);
    return () => document.removeEventListener('contextmenu', onContextMenu);
  }, []);

  // The menu holds the keyboard while it is open, so whatever had focus gets it back on the way
  // out — otherwise a dismissed menu would leave the app's key handling pointed at the body.
  const close = () => {
    pending?.restoreFocus?.focus();
    setPending(null);
  };

  return { pending, close };
}
