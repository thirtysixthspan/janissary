import React, { useRef } from 'react';
import { ModalDialog } from './ModalDialog';
import { useDialogKeyboard } from './useDialogKeyboard';
import type { FileNavigatorFailure } from './useFileNavigatorMoveOperations';

export function FileNavigatorFailureDialog({
  failure,
  onDismiss,
}: {
  failure: FileNavigatorFailure;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogKeyboard(dialogRef, (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Enter' || event.key === 'Escape') onDismiss();
  });
  return (
    <ModalDialog
      dialogRef={dialogRef}
      title={`Could not ${failure.operation} ${failure.failedPaths.length} of ${failure.total} items.`}
    >
      <div className="modal-paths">
        {failure.failedPaths.map((path) => <div key={path}>{path}</div>)}
      </div>
      <div className="modal-actions">
        <button className="modal-button selected" onClick={onDismiss}>Dismiss</button>
      </div>
    </ModalDialog>
  );
}
