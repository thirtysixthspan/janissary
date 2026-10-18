import { useEffect, useRef, useState } from 'react';
import { deleteKeyAnswer, type DeleteKeyAnswer } from './scripts-delete-keys';
import { deleteTitle, openEditorLine, systemScheduleLine } from './scripts-delete-text';

type Properties = {
  name: string;
  schedules: number;
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function DeleteScriptDialog({ name, schedules, open, onConfirm, onCancel }: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<'confirm' | 'cancel'>('cancel');
  const answerRef = useRef<(answer: DeleteKeyAnswer) => void>(() => {});

  answerRef.current = (answer) => {
    const actions: Record<DeleteKeyAnswer, () => void> = {
      confirm: onConfirm,
      cancel: onCancel,
      choose: selected === 'confirm' ? onConfirm : onCancel,
      toggle: () => setSelected((s) => (s === 'confirm' ? 'cancel' : 'confirm')),
    };
    actions[answer]();
  };

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const answer = deleteKeyAnswer(event.key);
      if (answer !== null) answerRef.current(answer);
    };
    const onClickOutside = (event: MouseEvent) => {
      if (event.target instanceof Node && dialogRef.current?.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    globalThis.addEventListener('keydown', onKeyDown, { capture: true });
    globalThis.addEventListener('click', onClickOutside, { capture: true });
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown, { capture: true });
      globalThis.removeEventListener('click', onClickOutside, { capture: true });
    };
  }, []);

  const notes = [systemScheduleLine(schedules), openEditorLine(open)].filter((note): note is string => note !== null);

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal" role="alertdialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-title">{deleteTitle(name)}</div>
        {notes.map((note) => (
          <div key={note} className="scripts-delete-note">{note}</div>
        ))}
        <div className="modal-actions">
          <button
            type="button"
            className={`modal-button${selected === 'confirm' ? ' selected' : ''}`}
            onClick={onConfirm}
          >
            Delete
          </button>
          <button
            type="button"
            className={`modal-button${selected === 'cancel' ? ' selected' : ''}`}
            onClick={onCancel}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
