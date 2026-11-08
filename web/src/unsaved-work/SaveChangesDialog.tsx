import React, { useRef, useState } from 'react';
import { useDialogKeyboard } from '../shared/useDialogKeyboard';
import { ModalDialog } from '../shared/ModalDialog';

export type SaveChoice = 'save' | 'discard' | 'cancel';

type Properties = {
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
  saving?: boolean;
  title?: string;
  className?: string;
} & (
  | { selected: SaveChoice; onSelect: (choice: SaveChoice) => void }
  | { selected?: undefined; onSelect?: undefined }
);

function nextChoice(current: SaveChoice, direction: 'left' | 'right'): SaveChoice {
  if (direction === 'left') return current === 'save' ? 'cancel' : current === 'discard' ? 'save' : 'discard';
  return current === 'save' ? 'discard' : current === 'discard' ? 'cancel' : 'save';
}

export function SaveChangesDialog({
  onSave, onDiscard, onCancel, saving = false, title = 'Do you want to save changes to this file?', className, selected, onSelect,
}: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [localSelection, setLocalSelection] = useState<SaveChoice>('save');
  const isControlled = selected !== undefined && onSelect !== undefined;
  const currentChoice = isControlled ? selected : localSelection;
  const save = () => { if (!saving) onSave(); };
  const choose = (choice: SaveChoice) => {
    if (selected !== undefined && onSelect !== undefined) onSelect(choice);
    else setLocalSelection(choice);
  };

  useDialogKeyboard(dialogRef, {
    y: save,
    n: onDiscard,
    enter: () => {
      if (currentChoice === 'save') save();
      else if (currentChoice === 'discard') onDiscard();
      else onCancel();
    },
    escape: onCancel,
    arrowleft: () => choose(nextChoice(currentChoice, 'left')),
    arrowright: () => choose(nextChoice(currentChoice, 'right')),
  });

  return (
    <ModalDialog dialogRef={dialogRef} title={title} className={className}>
      <div className="modal-actions">
        <button className={`modal-button${currentChoice === 'save' ? ' selected' : ''}`} onClick={save} disabled={saving}>
          Save (y)
        </button>
        <button className={`modal-button${currentChoice === 'discard' ? ' selected' : ''}`} onClick={onDiscard}>
          Don&#39;t Save (n)
        </button>
        <button className={`modal-button${currentChoice === 'cancel' ? ' selected' : ''}`} onClick={onCancel}>
          Cancel (Esc)
        </button>
      </div>
    </ModalDialog>
  );
}
