import React, { useRef, useState } from 'react';
import { useDialogKeyboard } from './useDialogKeyboard';

type Action = 'save' | 'cancel';

type Properties = { onSave: () => void; onCancel: () => void };

// Shown when a save would clobber a change another process made to the file on disk while the
// user was editing it (see EditorTab's mtimeMs-vs-dirty reconciliation).
export function OverwriteConflictDialog({ onSave, onCancel }: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Action>('save');
  const onSaveRef = useRef(onSave);
  const onCancelRef = useRef(onCancel);
  const selectedRef = useRef(selected);
  onSaveRef.current = onSave;
  onCancelRef.current = onCancel;
  selectedRef.current = selected;

  const onKeyDown = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    switch (e.key.toLowerCase()) {
    case 'y': { onSaveRef.current();
    break;
    }
    case 'enter': {
      if (selectedRef.current === 'save') onSaveRef.current();
      else onCancelRef.current();

    break;
    }
    case 'escape': { onCancelRef.current();
    break;
    }
    case 'arrowleft':
    case 'arrowright': {
      setSelected((s) => (s === 'save' ? 'cancel' : 'save'));

    break;
    }
    // No default
    }
  };
  useDialogKeyboard(dialogRef, onKeyDown);

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal" role="alertdialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-title">This file changed on disk. Overwrite it with your changes?</div>
        <div className="modal-actions">
          <button className={`modal-button${selected === 'save' ? ' selected' : ''}`} onClick={onSave}>
            Overwrite (y)
          </button>
          <button className={`modal-button${selected === 'cancel' ? ' selected' : ''}`} onClick={onCancel}>
            Cancel (Esc)
          </button>
        </div>
      </div>
    </div>
  );
}
