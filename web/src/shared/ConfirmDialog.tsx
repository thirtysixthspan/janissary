import React from 'react';
import { ConfirmDialogShell } from './ConfirmDialogShell';

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
 *
 * The markup and the key wiring belong to `ConfirmDialogShell`, which the host's own quit and delete
 * dialogs already render; this only fixes the one label a plugin caller has no opinion about, so a
 * plugin question and a host question cannot drift apart.
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
  return (
    <ConfirmDialogShell
      title={title}
      confirmLabel={confirmLabel}
      cancelLabel="Cancel"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
