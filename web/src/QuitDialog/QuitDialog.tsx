import React, { useEffect, useRef, useState } from 'react';

// Confirmation dialog shown when the `quit` command runs. Modal: nothing but y/n/Enter/Escape/
// Left/Right, or a click on the dialog itself, does anything while it's open. Both input
// modalities are trapped the same way — a window-level *capture*-phase listener intercepts the
// event before it can reach anything else (the command line, a tab-strip click, keyboard
// shortcuts, a focused harness terminal, etc.). A click outside the dialog is simply swallowed
// (no confirm, no cancel) rather than reaching whatever is underneath — only the dialog's own
// buttons do anything. This doesn't depend on z-index/paint order or on focus having actually
// landed on the dialog, so there's no gap for an event to slip through underneath.
//
// Cancel is selected by default (the safer option). Left/Right move the selection between the two
// buttons; Enter runs whichever is currently selected. y/n remain direct shortcuts regardless of
// the current selection.
type Properties = { onConfirm: () => void; onCancel: () => void };

export function QuitDialog({ onConfirm, onCancel }: Properties) {
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

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal" role="alertdialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-title">Are you sure you want to quit?</div>
        <div className="modal-actions">
          <button className={`modal-button${selected === 'confirm' ? ' selected' : ''}`} onClick={onConfirm}>
            Quit (y)
          </button>
          <button className={`modal-button${selected === 'cancel' ? ' selected' : ''}`} onClick={onCancel}>
            Cancel (n)
          </button>
        </div>
      </div>
    </div>
  );
}
