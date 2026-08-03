import React, { useEffect, useRef, useState } from 'react';

// Shown when Backspace/Delete is pressed on a selected row, before the timer is cancelled in its
// owning tab. The app's own confirm shell lives in host UI a plugin may not import, so this
// reproduces its contract rather than reaching for it: y/n shortcuts, Left/Right move the selection,
// Enter runs the selected option, Escape cancels, cancel is selected by default, and every other key
// — plus any click outside — is swallowed so the modal keeps the keyboard while it is open.
type Properties = { id: string; onConfirm: () => void; onCancel: () => void };

export function DeleteScheduleDialog({ id, onConfirm, onCancel }: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<'confirm' | 'cancel'>('cancel');
  const keysRef = useRef<Record<string, () => void>>({});
  const toggle = () => setSelected((s) => (s === 'confirm' ? 'cancel' : 'confirm'));

  keysRef.current = {
    y: onConfirm,
    n: onCancel,
    enter: () => (selected === 'confirm' ? onConfirm() : onCancel()),
    escape: onCancel,
    arrowleft: toggle,
    arrowright: toggle,
  };

  useEffect(() => {
    dialogRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      keysRef.current[e.key.toLowerCase()]?.();
    };
    const onClickOutside = (e: MouseEvent) => {
      if (dialogRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    globalThis.addEventListener('keydown', onKeyDown, { capture: true });
    globalThis.addEventListener('click', onClickOutside, { capture: true });
    return () => {
      globalThis.removeEventListener('keydown', onKeyDown, { capture: true });
      globalThis.removeEventListener('click', onClickOutside, { capture: true });
    };
  }, []);

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal" role="alertdialog" aria-modal="true" tabIndex={-1}>
        <div className="modal-title">{`Delete schedule "${id}"?`}</div>
        <div className="modal-actions">
          <button className={`modal-button${selected === 'confirm' ? ' selected' : ''}`} onClick={onConfirm}>
            Delete
          </button>
          <button className={`modal-button${selected === 'cancel' ? ' selected' : ''}`} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
