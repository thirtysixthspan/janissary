import React from 'react';
import { useConfirmDialogKeys } from '../useConfirmDialogKeys';

// Confirmation dialog shown when the `quit` command runs. Modal: nothing but y/n/Enter/Escape/
// Left/Right, or a click on the dialog itself, does anything while it's open. Both input
// modalities are trapped the same way — a window-level *capture*-phase listener intercepts the
// event before it can reach anything else (the command line, a tab-strip click, keyboard
// shortcuts, a focused harness terminal, etc.). A click outside the dialog is simply swallowed
// (no confirm, no cancel) rather than reaching whatever is underneath — only the dialog's own
// buttons do anything. This doesn't depend on z-index/paint order or on focus having actually
// landed on the dialog, so there's no gap for an event to slip through underneath.
type Properties = { onConfirm: () => void; onCancel: () => void };

export function QuitDialog({ onConfirm, onCancel }: Properties) {
  const { dialogRef, selected } = useConfirmDialogKeys(onConfirm, onCancel);

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
