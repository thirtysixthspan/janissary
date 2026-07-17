import React, { useRef, useState } from 'react';
import { useDialogKeyboard } from './useDialogKeyboard';
import { useLatestRef } from './useLatestRef';
import { dialogKeyHandler } from './dialog-key-handler';
import { ModalDialog } from './ModalDialog';

type Action = 'save' | 'cancel';

type Properties = { onSave: () => void; onCancel: () => void };

// Shown when a save would clobber a change another process made to the file on disk while the
// user was editing it (see EditorTab's mtimeMs-vs-dirty reconciliation).
export function OverwriteConflictDialog({ onSave, onCancel }: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Action>('save');
  const onSaveRef = useLatestRef(onSave);
  const onCancelRef = useLatestRef(onCancel);
  const selectedRef = useLatestRef(selected);

  const onKeyDown = dialogKeyHandler({
    y: () => onSaveRef.current(),
    enter: () => (selectedRef.current === 'save' ? onSaveRef.current() : onCancelRef.current()),
    escape: () => onCancelRef.current(),
    arrowleft: () => setSelected((s) => (s === 'save' ? 'cancel' : 'save')),
    arrowright: () => setSelected((s) => (s === 'save' ? 'cancel' : 'save')),
  });
  useDialogKeyboard(dialogRef, onKeyDown);

  return (
    <ModalDialog dialogRef={dialogRef} title="This file changed on disk. Overwrite it with your changes?">
      <div className="modal-actions">
        <button className={`modal-button${selected === 'save' ? ' selected' : ''}`} onClick={onSave}>
          Overwrite (y)
        </button>
        <button className={`modal-button${selected === 'cancel' ? ' selected' : ''}`} onClick={onCancel}>
          Cancel (Esc)
        </button>
      </div>
    </ModalDialog>
  );
}
