import { useRef, useState } from 'react';
import { useDialogKeyboard } from './useDialogKeyboard';

// Shared keyboard/click-outside behavior for a two-button (confirm/cancel) modal dialog: y/n
// direct shortcuts, Left/Right move the selection, Enter runs the selected option, Escape
// cancels, and a click outside the dialog is swallowed rather than reaching whatever is
// underneath. Cancel is selected by default (the safer option). Every other key is swallowed too,
// not just ignored — see useDialogKeyboard's map form, which owns that wiring.
export function useConfirmDialogKeys(onConfirm: () => void, onCancel: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<'confirm' | 'cancel'>('cancel');
  const toggle = () => setSelected((s) => (s === 'confirm' ? 'cancel' : 'confirm'));

  useDialogKeyboard(dialogRef, {
    y: onConfirm,
    n: onCancel,
    enter: () => (selected === 'confirm' ? onConfirm() : onCancel()),
    escape: onCancel,
    arrowleft: toggle,
    arrowright: toggle,
  });

  return { dialogRef, selected };
}
