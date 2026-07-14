import React, { useRef, useState } from 'react';
import { useDialogKeyboard } from '../useDialogKeyboard';
import { ModalDialog } from '../ModalDialog';

type Action = 'overwrite' | 'cancel';

type Properties = { name: string; onOverwrite: () => void; onCancel: () => void };

export function MoveConflictDialog({ name, onOverwrite, onCancel }: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Action>('cancel');
  const onOverwriteRef = useRef(onOverwrite);
  const onCancelRef = useRef(onCancel);
  const selectedRef = useRef(selected);
  onOverwriteRef.current = onOverwrite;
  onCancelRef.current = onCancel;
  selectedRef.current = selected;

  const onKeyDown = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    switch (e.key.toLowerCase()) {
    case 'enter': {
      if (selectedRef.current === 'overwrite') onOverwriteRef.current();
      else onCancelRef.current();

    break;
    }
    case 'escape': { onCancelRef.current();
    break;
    }
    case 'arrowleft': case 'arrowright': {
      setSelected((s) => (s === 'overwrite' ? 'cancel' : 'overwrite'));

    break;
    }
    // No default
    }
  };
  useDialogKeyboard(dialogRef, onKeyDown);

  return (
    <ModalDialog dialogRef={dialogRef} title={`"${name}" already exists here. Overwrite it?`}>
      <div className="modal-actions">
        <button className={`modal-button${selected === 'overwrite' ? ' selected' : ''}`} onClick={onOverwrite}>
          Overwrite
        </button>
        <button className={`modal-button${selected === 'cancel' ? ' selected' : ''}`} onClick={onCancel}>
          Cancel (Esc)
        </button>
      </div>
    </ModalDialog>
  );
}
