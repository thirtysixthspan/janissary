import React, { useRef, useState } from 'react';
import { useDialogKeyboard } from '../useDialogKeyboard';
import { ModalDialog } from '../ModalDialog';

type Action = 'overwrite' | 'skip' | 'cancel';

type Properties = {
  name?: string;
  title?: string;
  onOverwrite: () => void;
  onSkip?: () => void;
  onCancel: () => void;
};

export function MoveConflictDialog({ name, title, onOverwrite, onSkip, onCancel }: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Action>('cancel');
  const onOverwriteRef = useRef(onOverwrite);
  const onCancelRef = useRef(onCancel);
  const onSkipRef = useRef(onSkip);
  const selectedRef = useRef(selected);
  onOverwriteRef.current = onOverwrite;
  onCancelRef.current = onCancel;
  onSkipRef.current = onSkip;
  selectedRef.current = selected;

  const onKeyDown = (e: KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    switch (e.key.toLowerCase()) {
    case 'enter': {
      if (selectedRef.current === 'overwrite') onOverwriteRef.current();
      else if (selectedRef.current === 'skip') onSkipRef.current?.();
      else onCancelRef.current();

    break;
    }
    case 'escape': { onCancelRef.current();
    break;
    }
    case 'arrowleft': case 'arrowright': {
      const actions: Action[] = onSkipRef.current ? ['overwrite', 'skip', 'cancel'] : ['overwrite', 'cancel'];
      setSelected((current) => {
        const offset = e.key.toLowerCase() === 'arrowleft' ? -1 : 1;
        return actions[(actions.indexOf(current) + offset + actions.length) % actions.length];
      });

    break;
    }
    // No default
    }
  };
  useDialogKeyboard(dialogRef, onKeyDown);

  return (
    <ModalDialog dialogRef={dialogRef} title={title ?? `"${name}" already exists here. Overwrite it?`}>
      <div className="modal-actions">
        <button className={`modal-button${selected === 'overwrite' ? ' selected' : ''}`} onClick={onOverwrite}>
          {onSkip ? 'Overwrite all' : 'Overwrite'}
        </button>
        {onSkip && (
          <button className={`modal-button${selected === 'skip' ? ' selected' : ''}`} onClick={onSkip}>
            Skip conflicts
          </button>
        )}
        <button className={`modal-button${selected === 'cancel' ? ' selected' : ''}`} onClick={onCancel}>
          Cancel (Esc)
        </button>
      </div>
    </ModalDialog>
  );
}
