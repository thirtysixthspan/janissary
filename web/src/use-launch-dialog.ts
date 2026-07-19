import { useCallback, useEffect, useRef } from 'react';
import { useDialogKeyboard } from './useDialogKeyboard';
import type { JanusClient } from './ws';

// Shared cancel/create wiring for the "New harness" and "New schedule" launch dialogs: a Close
// RPC on cancel, a command RPC (built from `fields`) plus the same Close RPC on create, Escape/Enter
// keyboard handling, and focusing the submit button on reopen when a remembered selection was
// restored. `canSubmit`, when given, gates both the Enter shortcut and (by the caller) the button.
export function useLaunchDialog<Fields>(
  client: JanusClient,
  closeMethod: 'closeHarnessLaunch' | 'closeScheduleLaunch',
  fields: Fields,
  buildCommand: (fields: Fields) => string,
  hadRemembered: boolean,
  canSubmit?: (fields: Fields) => boolean,
) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);

  const cancel = useCallback(() => client.send({ method: closeMethod, params: {} }), [client, closeMethod]);
  const create = useCallback(() => {
    client.send({ method: 'command', params: { text: buildCommand(fields) } });
    client.send({ method: closeMethod, params: {} });
  }, [client, closeMethod, buildCommand, fields]);

  useDialogKeyboard(dialogRef, (e) => {
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (!canSubmit || canSubmit(fields)) create(); }
  });

  useEffect(() => {
    if (hadRemembered) submitButtonRef.current?.focus();
  }, [hadRemembered]);

  return { dialogRef, submitButtonRef, cancel, create };
}
