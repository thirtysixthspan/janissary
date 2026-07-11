import React from 'react';
import { ConfirmDialogShell } from './ConfirmDialogShell';

// Shown instead of the plain QuitDialog when `quit` (or closing the last tab) is requested while
// an editor tab has unsaved changes — those paths close every tab at once and never go through
// CloseSaveGuard's per-tab check, so this is the one place that catches them. Confirming quits
// immediately, discarding whatever is unsaved; there is no per-file save step here.
type Properties = { onConfirm: () => void; onCancel: () => void };

export function UnsavedQuitDialog({ onConfirm, onCancel }: Properties) {
  return (
    <ConfirmDialogShell
      title="You have unsaved changes. Close anyway?"
      confirmLabel="Close anyway (y)"
      cancelLabel="Cancel (n)"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
