import React from 'react';
import { ConfirmDialogShell } from './ConfirmDialogShell';

// Shown when Backspace/Delete is pressed on a selected row in the aggregated schedules tab, before
// the timer is cancelled in its owning tab.
type Properties = { id: string; onConfirm: () => void; onCancel: () => void };

export function DeleteScheduleDialog({ id, onConfirm, onCancel }: Properties) {
  return (
    <ConfirmDialogShell
      title={`Delete schedule "${id}"?`}
      confirmLabel="Delete"
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
