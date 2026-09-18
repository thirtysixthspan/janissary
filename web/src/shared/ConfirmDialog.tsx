import React, { useEffect, useRef, useState } from 'react';

/**
 * The application's terse confirmation: a title, a confirm button, a cancel button, and one keyboard
 * contract behind all of them — `y` confirms, `n` and Escape cancel, the arrow keys move between the
 * two buttons, and Enter takes whichever is selected. Cancel is selected first, so a reflexive Enter
 * on a destructive question does nothing.
 *
 * The keydown listener is registered on `globalThis` in the capture phase and swallows every key
 * while the dialog is open, so nothing underneath — a terminal, a command bar, a list's own arrow
 * navigation — acts on a keystroke meant for the question on top of it.
 *
 * Shared rather than per-caller because the alternative was demonstrably worse: this shipped as two
 * line-for-line copies, one per plugin list, and modal keyboard behavior that drifts by surface is
 * the kind of divergence nothing in the tree would show. Published to plugins through
 * `web/src/plugins/api.ts` on the same terms as the host's command bar and inline-edit field.
 */
export function ConfirmDialog({
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

  // Through a ref rather than a dependency of the effect below: the listener is bound once for the
  // life of the dialog, and re-binding it on every `selected` change would be a listener churn for
  // a table that is cheap to replace.
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
