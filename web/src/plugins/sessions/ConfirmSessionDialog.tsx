import React, { useEffect, useRef, useState } from 'react';

// One dialog for both confirmations — detach and end differ only in their wording, and the terse
// shape is `DeleteConversationDialog`'s: a title, two buttons, and the keyboard answering both.
// Written against the host's modal CSS classes rather than importing host UI, which the plugin
// import boundary forbids.
export function ConfirmSessionDialog({
  title,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  confirmLabel: string;
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
        <div className="modal-title">{title}</div>
        <div className="modal-actions">
          <button
            className={`modal-button${selected === 'confirm' ? ' selected' : ''}`}
            onClick={onConfirm}
          >
            {confirmLabel}
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
