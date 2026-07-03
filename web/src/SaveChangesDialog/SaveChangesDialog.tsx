import React, { useEffect, useRef, useState } from 'react';

type Action = 'save' | 'discard' | 'cancel';

type Properties = { onSave: () => void; onDiscard: () => void; onCancel: () => void };

export function SaveChangesDialog({ onSave, onDiscard, onCancel }: Properties) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<Action>('save');
  const onSaveRef = useRef(onSave);
  const onDiscardRef = useRef(onDiscard);
  const onCancelRef = useRef(onCancel);
  const selectedRef = useRef(selected);
  onSaveRef.current = onSave;
  onDiscardRef.current = onDiscard;
  onCancelRef.current = onCancel;
  selectedRef.current = selected;

  useEffect(() => {
    dialogRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      switch (e.key.toLowerCase()) {
      case 'y': { onSaveRef.current();
      break;
      }
      case 'n': { onDiscardRef.current();
      break;
      }
      case 'enter': {
        if (selectedRef.current === 'save') onSaveRef.current();
        else if (selectedRef.current === 'discard') onDiscardRef.current();
        else onCancelRef.current();

      break;
      }
      case 'escape': { onCancelRef.current();
      break;
      }
      case 'arrowleft': {
        setSelected((s) => (s === 'save' ? 'cancel' : s === 'discard' ? 'save' : 'discard'));

      break;
      }
      case 'arrowright': {
        setSelected((s) => (s === 'save' ? 'discard' : s === 'discard' ? 'cancel' : 'save'));

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
        <div className="modal-title">Do you want to save changes to this file?</div>
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
      </div>
    </div>
  );
}
