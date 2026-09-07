import React, { useRef, useState } from 'react';
import { useDialogKeyboard } from '../useDialogKeyboard';
import { ModalDialog } from '../ModalDialog';

type Action = 'save' | 'discard' | 'cancel';

type Properties = { onSave: () => void; onDiscard: () => void; onCancel: () => void; saving?: boolean };

export function SaveChangesDialog({ onSave, onDiscard, onCancel, saving = false }: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Action>('save');
  const save = () => { if (!saving) onSave(); };

  useDialogKeyboard(dialogRef, {
    y: save,
    n: onDiscard,
    enter: () => {
      if (selected === 'save') save();
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
        <button className={`modal-button${selected === 'save' ? ' selected' : ''}`} onClick={save} disabled={saving}>
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
