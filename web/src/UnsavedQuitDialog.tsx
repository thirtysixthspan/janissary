import React from 'react';
import { useConfirmDialogKeys } from './useConfirmDialogKeys';

// Shown instead of the plain QuitDialog when `quit` (or closing the last tab) is requested while
// an editor tab has unsaved changes — those paths close every tab at once and never go through
// CloseSaveGuard's per-tab check, so this is the one place that catches them. Confirming quits
// immediately, discarding whatever is unsaved; there is no per-file save step here.
type Properties = { onConfirm: () => void; onCancel: () => void };

export function UnsavedQuitDialog({ onConfirm, onCancel }: Properties) {
  const { dialogRef, selected } = useConfirmDialogKeys(onConfirm, onCancel);

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal" role="alertdialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-title">You have unsaved changes. Close anyway?</div>
        <div className="modal-actions">
          <button className={`modal-button${selected === 'confirm' ? ' selected' : ''}`} onClick={onConfirm}>
            Close anyway (y)
          </button>
          <button className={`modal-button${selected === 'cancel' ? ' selected' : ''}`} onClick={onCancel}>
            Cancel (n)
          </button>
        </div>
      </div>
    </div>
  );
}
