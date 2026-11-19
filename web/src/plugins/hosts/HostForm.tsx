import React, { useEffect, useRef, useState } from 'react';
import type { HostRow } from '@shared/plugins/hosts/shared';
import { isSaveHostResult } from '@shared/plugins/hosts/shared';
import { ModalDialog, useDialogKeyboard, type TabPluginClientCapabilities } from '../api';

type Properties = {
  initial?: HostRow;
  intent: TabPluginClientCapabilities['intent'];
  onSaved: (name: string) => void;
  onCancel: () => void;
};

type Fields = { name: string; user: string; destination: string; path: string };

function nextFocus(at: number, length: number, backwards: boolean): number {
  if (at < 0) return 0;
  if (backwards) return (at - 1 + length) % length;
  return (at + 1) % length;
}

export function HostForm({ initial, intent, onSaved, onCancel }: Properties) {
  const [fields, setFields] = useState<Fields>({
    name: initial?.name ?? '',
    user: initial?.user ?? '',
    destination: initial?.destination ?? '',
    path: initial?.path ?? '',
  });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const setField = (key: keyof Fields) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setFields((current) => ({ ...current, [key]: event.target.value }));
    setError(null);
  };

  const dismiss = () => { if (!pending) onCancel(); };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const reply = await intent<unknown>('save', {
        ...fields,
        ...(initial !== undefined && { originalName: initial.name }),
      });
      if (!isSaveHostResult(reply)) {
        setError('Could not save host.');
        return;
      }
      if (!reply.ok) {
        setError(reply.error);
        return;
      }
      onSaved(reply.name);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : 'Could not save host.');
    } finally {
      setPending(false);
    }
  };

  useDialogKeyboard(dialogRef, (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = [
      ...(formRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? []),
    ];
    if (focusable.length === 0) return;
    const at = focusable.indexOf(document.activeElement as HTMLElement);
    event.preventDefault();
    event.stopPropagation();
    focusable[nextFocus(at, focusable.length, event.shiftKey)].focus();
  });

  useEffect(() => { nameRef.current?.focus(); }, []);

  return (
    <ModalDialog
      dialogRef={dialogRef}
      title={initial === undefined ? 'New host' : `Edit host ${initial.name}`}
      className="host-form"
    >
      <form ref={formRef} onSubmit={(event) => { void submit(event); }}>
        <label>
          Name
          <input ref={nameRef} value={fields.name} onChange={setField('name')} />
        </label>
        <label>
          User
          <input value={fields.user} placeholder="optional" onChange={setField('user')} />
        </label>
        <label>
          Destination
          <input value={fields.destination} placeholder="host[:port]" onChange={setField('destination')} />
        </label>
        <label>
          Path
          <input value={fields.path} placeholder="optional" onChange={setField('path')} />
        </label>
        {error !== null && <div className="host-form-error">{error}</div>}
        <div className="modal-actions">
          <button type="submit" className="modal-button" disabled={pending}>Save</button>
          <button type="button" className="modal-button" onClick={dismiss}>Cancel</button>
        </div>
      </form>
    </ModalDialog>
  );
}
