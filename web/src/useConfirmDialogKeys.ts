import { useEffect, useRef, useState } from 'react';

// Shared keyboard/click-outside behavior for a two-button (confirm/cancel) modal dialog: y/n
// direct shortcuts, Left/Right move the selection, Enter runs the selected option, Escape
// cancels, and a click outside the dialog is swallowed rather than reaching whatever is
// underneath. Cancel is selected by default (the safer option).
export function useConfirmDialogKeys(onConfirm: () => void, onCancel: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<'confirm' | 'cancel'>('cancel');
  // Refs so the capture listeners (registered once) always see the latest callbacks/selection.
  const onConfirmRef = useRef(onConfirm);
  const onCancelRef = useRef(onCancel);
  const selectedRef = useRef(selected);
  onConfirmRef.current = onConfirm;
  onCancelRef.current = onCancel;
  selectedRef.current = selected;

  useEffect(() => {
    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      switch (e.key.toLowerCase()) {
      case 'y': { onConfirmRef.current();
      break;
      }
      case 'n': { onCancelRef.current();
      break;
      }
      case 'enter': {
        if (selectedRef.current === 'confirm') onConfirmRef.current();
        else onCancelRef.current();

      break;
      }
      case 'escape': { onCancelRef.current();
      break;
      }
      case 'arrowleft': case 'arrowright': { setSelected((s) => (s === 'confirm' ? 'cancel' : 'confirm'));
      break;
      }
      // No default — every other key is swallowed, not just ignored.
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (dialogRef.current?.contains(e.target as Node)) return; // the dialog's own buttons handle themselves
      // Swallow it outright: blocked from reaching anything underneath, but does not cancel.
      e.preventDefault();
      e.stopPropagation();
    };
    globalThis.addEventListener('keydown', onKeyDown, { capture: true });
    globalThis.addEventListener('click', onClickOutside, { capture: true });
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown, { capture: true });
      globalThis.removeEventListener('click', onClickOutside, { capture: true });
    };
  }, []);

  return { dialogRef, selected };
}
