import React from 'react';
import { ConfirmDialog } from '../api';

// Deleting a row is not undoable and not something a stray double-click should do, so it asks —
// with the host's own dialog, published for exactly this, so a plugin question cannot drift from a
// host one. The title names the table because the answer is destructive and irreversible.
export function DeleteRowDialog({
  object, onConfirm, onCancel,
}: {
  object: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  return (
    <ConfirmDialog
      title={`Delete row from "${object}"?`}
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
