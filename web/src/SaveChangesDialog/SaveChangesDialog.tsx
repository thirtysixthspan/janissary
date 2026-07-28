import React, { useRef, useState } from 'react';
import { useDialogKeyboard } from '../useDialogKeyboard';
import { ModalDialog } from '../ModalDialog';

type Action = 'save' | 'discard' | 'cancel';

type Properties = { onSave: () => void; onDiscard: () => void; onCancel: () => void };

export function SaveChangesDialog({ onSave, onDiscard, onCancel }: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Action>('save');

  useDialogKeyboard(dialogRef, {
    y: onSave,
    n: onDiscard,
    enter: () => {
      if (selected === 'save') onSave();
      else if (selected === 'discard') onDiscard();
      else onCancel();
    },
    escape: onCancel,
    arrowleft: () => setSelected((s) => (s === 'save' ? 'cancel' : s === 'discard' ? 'save' : 'discard')),
    arrowright: () => setSelected((s) => (s === 'save' ? 'discard' : s === 'discard' ? 'cancel' : 'save')),
  });

  return (
    <ModalDialog dialogRef={dialogRef} title="Do you want to save changes to this file?">
      <div className="modal-actions">
        <button className={`modal-button${selected === 'save' ? ' selected' : ''}`} onClick={onSave}>
          Save (y)
        </button>
        <button className={`modal-button${selected === 'discard' ? ' selected' : ''}`} onClick={onDiscard}>
          Don&#39;t Save (n)
        </button>
        <button className={`modal-button${selected === 'cancel' ? ' selected' : ''}`} onClick={onCancel}>
          Cancel (Esc)
        </button>
      </div>
    </ModalDialog>
  );
}
