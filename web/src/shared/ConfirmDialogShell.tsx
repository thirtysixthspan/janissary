import React from 'react';
import { useConfirmDialogKeys } from './useConfirmDialogKeys';

type Properties = {
  title: string;
  notes?: string[];
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// Shared two-button (confirm/cancel) modal shell — see useConfirmDialogKeys for the trapped
// keyboard/click-outside behavior. Callers only vary the title, the optional note lines, and button text.
export function ConfirmDialogShell({ title, notes = [], confirmLabel, cancelLabel, onConfirm, onCancel }: Properties) {
  const { dialogRef, selected } = useConfirmDialogKeys(onConfirm, onCancel);

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal" role="alertdialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-title">{title}</div>
        {notes.map((note) => (
          <div key={note} className="modal-note">{note}</div>
        ))}
        <div className="modal-actions">
          <button className={`modal-button${selected === 'confirm' ? ' selected' : ''}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button className={`modal-button${selected === 'cancel' ? ' selected' : ''}`} onClick={onCancel}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
