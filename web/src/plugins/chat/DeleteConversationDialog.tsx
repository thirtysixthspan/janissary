import React, { useEffect, useRef, useState } from 'react';

export function DeleteConversationDialog({
  title,
  onConfirm,
  onCancel,
}: {
  title: string;
  onConfirm(): void;
  onCancel(): void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<'confirm' | 'cancel'>('cancel');
  const actionsRef = useRef<Record<string, () => void>>({});
  const toggle = () => { setSelected((value) => value === 'confirm' ? 'cancel' : 'confirm'); };

  actionsRef.current = {
    y: onConfirm,
    n: onCancel,
    enter: () => { if (selected === 'confirm') onConfirm(); else onCancel(); },
    escape: onCancel,
    arrowleft: toggle,
    arrowright: toggle,
  };

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      actionsRef.current[event.key.toLowerCase()]?.();
    };
    globalThis.addEventListener('keydown', onKeyDown, { capture: true });
    return () => { globalThis.removeEventListener('keydown', onKeyDown, { capture: true }); };
  }, []);

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal" role="alertdialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-title">{`Delete conversation "${title}"?`}</div>
        <div className="modal-actions">
          <button
            className={`modal-button${selected === 'confirm' ? ' selected' : ''}`}
            onClick={onConfirm}
          >
            Delete
          </button>
          <button
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
