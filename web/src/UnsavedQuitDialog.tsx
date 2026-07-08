import React, { useEffect, useRef, useState } from 'react';

// Shown instead of the plain QuitDialog when `quit` (or closing the last tab) is requested while
// an editor tab has unsaved changes — those paths close every tab at once and never go through
// CloseSaveGuard's per-tab check, so this is the one place that catches them. Confirming quits
// immediately, discarding whatever is unsaved; there is no per-file save step here.
type Properties = { onConfirm: () => void; onCancel: () => void };

export function UnsavedQuitDialog({ onConfirm, onCancel }: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<'confirm' | 'cancel'>('cancel');
  const onConfirmRef = useRef(onConfirm);
  const onCancelRef = useRef(onCancel);
  const selectedRef = useRef(selected);
  onConfirmRef.current = onConfirm;
  onCancelRef.current = onCancel;
  selectedRef.current = selected;

  useEffect(() => {
    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      switch (e.key.toLowerCase()) {
      case 'y': { onConfirmRef.current();
      break;
      }
      case 'n': { onCancelRef.current();
      break;
      }
      case 'enter': {
        if (selectedRef.current === 'confirm') onConfirmRef.current();
        else onCancelRef.current();

      break;
      }
      case 'escape': { onCancelRef.current();
      break;
      }
      case 'arrowleft': case 'arrowright': { setSelected((s) => (s === 'confirm' ? 'cancel' : 'confirm'));
      break;
      }
      // No default
      }
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
        <div className="modal-title">You have unsaved changes. Close anyway?</div>
        <div className="modal-actions">
          <button className={`modal-button${selected === 'confirm' ? ' selected' : ''}`} onClick={onConfirm}>
            Close anyway (y)
          </button>
          <button className={`modal-button${selected === 'cancel' ? ' selected' : ''}`} onClick={onCancel}>
            Cancel (n)
          </button>
        </div>
      </div>
    </div>
  );
}
