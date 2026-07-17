import React, { useRef, useState } from 'react';
import { useDialogKeyboard } from '../useDialogKeyboard';
import { useLatestRef } from '../useLatestRef';
import { dialogKeyHandler } from '../dialog-key-handler';
import { ModalDialog } from '../ModalDialog';

type Action = 'save' | 'discard' | 'cancel';

type Properties = { onSave: () => void; onDiscard: () => void; onCancel: () => void };

export function SaveChangesDialog({ onSave, onDiscard, onCancel }: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Action>('save');
  const onSaveRef = useLatestRef(onSave);
  const onDiscardRef = useLatestRef(onDiscard);
  const onCancelRef = useLatestRef(onCancel);
  const selectedRef = useLatestRef(selected);

  const onKeyDown = dialogKeyHandler({
    y: () => onSaveRef.current(),
    n: () => onDiscardRef.current(),
    enter: () => {
      if (selectedRef.current === 'save') onSaveRef.current();
      else if (selectedRef.current === 'discard') onDiscardRef.current();
      else onCancelRef.current();
    },
    escape: () => onCancelRef.current(),
    arrowleft: () => setSelected((s) => (s === 'save' ? 'cancel' : s === 'discard' ? 'save' : 'discard')),
    arrowright: () => setSelected((s) => (s === 'save' ? 'discard' : s === 'discard' ? 'cancel' : 'save')),
  });
  useDialogKeyboard(dialogRef, onKeyDown);

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
