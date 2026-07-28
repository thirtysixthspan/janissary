import React from 'react';
import { ConfirmDialogShell } from './ConfirmDialogShell';

// Shown when Backspace/Delete is pressed on a selected file-navigator row, before the file or
// directory is actually removed from disk.
type Properties = { name?: string; count?: number; onConfirm: () => void; onCancel: () => void };

export function DeleteFileDialog({ name, count, onConfirm, onCancel }: Properties) {
  return (
    <ConfirmDialogShell
      title={count === undefined ? `Delete "${name}"?` : `Delete ${count} items?`}
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
