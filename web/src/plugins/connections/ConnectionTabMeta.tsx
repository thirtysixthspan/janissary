import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleStop, faCircleXmark, faLocationCrosshairs } from '@fortawesome/free-solid-svg-icons';
import { recordConnectionName, type RecordConnectionRow } from '@shared/plugins/connections/shared';

// The connection tab's metadata bar: the list row's facts in the list's order, then the model and the
// started time, with the controls as icons at its right edge. Focus brings the owning tab forward
// while the server names one, stop halts the work in progress, a core prompt's Cancel or an agent
// run's Terminate, and Close ends a core session. Each keeps its verb as its accessible name.

type Properties = {
  record: RecordConnectionRow;
  pendingTerminate: boolean;
  onFocus(): void;
  onCancel(): void;
  onCloseSession(): void;
  onTerminate(): void;
};

function Field({ className, label, value, tooltip }: {
  className: string; label: string; value: string; tooltip?: string;
}) {
  return <span className={className} title={tooltip ?? `${label}: ${value}`}>{value}</span>;
}

export function ConnectionTabMeta({ record, pendingTerminate, onFocus, onCancel, onCloseSession, onTerminate }: Properties) {
  const acp = record.kind === 'acp';
  const running = record.status === 'Running';
  const canCancel = acp && running;
  const canClose = acp && (running || record.status === 'Idle');
  const canTerminate = record.kind === 'agent' && running;
  const name = recordConnectionName(record);
  const started = new Date(record.startedAt);
  return (
    <header className="plugin-meta connections-record-header">
      <Field className="connections-record-host" label="Host" value={record.host} />
      <Field className="connections-record-owner" label="Tab" value={record.ownerName} />
      <Field className="connections-record-id" label="Connection ID" value={record.id} />
      <Field className="connections-record-name" label="Connection Name" value={name}
        tooltip={`Connection Name: ${name}\n${record.title}`} />
      <Field className="connections-record-model" label="Model" value={record.model} />
      <Field className="connections-record-status" label="Connection State" value={record.status} />
      <time className="connections-record-started" dateTime={started.toISOString()}
        title={`Started: ${started.toLocaleString()}`}>Started {started.toLocaleString()}</time>
      <span className="plugin-actions">
        {record.focusTarget !== undefined && <IconButton action="focus" label="Focus tab" icon={faLocationCrosshairs}
          onClick={onFocus} />}
        {canCancel && <IconButton action="cancel" label="Cancel" icon={faCircleStop} onClick={onCancel} />}
        {canTerminate && <IconButton action="terminate" label="Terminate" icon={faCircleStop}
          disabled={pendingTerminate} onClick={onTerminate} />}
        {canClose && <IconButton action="close-session" label="Close session" icon={faCircleXmark}
          onClick={onCloseSession} />}
      </span>
    </header>
  );
}

function IconButton({ action, label, icon, disabled, onClick }: {
  action: string; label: string; icon: typeof faCircleStop; disabled?: boolean; onClick(): void;
}) {
  return (
    <button type="button" data-action={action} title={label} aria-label={label} disabled={disabled} onClick={onClick}>
      <FontAwesomeIcon icon={icon} />
    </button>
  );
}
