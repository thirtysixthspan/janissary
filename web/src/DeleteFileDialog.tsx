import React from 'react';
import { ConfirmDialogShell } from './ConfirmDialogShell';

// Shown when Backspace/Delete is pressed on a selected file-tree row, before the file or
// directory is actually removed from disk.
type Properties = { name: string; onConfirm: () => void; onCancel: () => void };

export function DeleteFileDialog({ name, onConfirm, onCancel }: Properties) {
  return (
    <ConfirmDialogShell
      title={`Delete "${name}"?`}
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
