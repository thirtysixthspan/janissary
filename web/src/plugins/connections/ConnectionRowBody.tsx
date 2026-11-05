import React from 'react';
import type { ConnectionRow, LiveConnectionRow, RecordConnectionRow } from '@shared/plugins/connections/shared';
import { ConnectionRowActions } from './ConnectionRowActions';

// The cells of one connections row, in the two renderings the sessions list uses: the table in the
// centre and two stacked lines in a sidebar.

type ConnectionRowProperties = {
  row: ConnectionRow;
  label: string;
  activity: { text: string; dateTime?: string };
  onClose(row: LiveConnectionRow | RecordConnectionRow): void;
  onDelete(row: RecordConnectionRow): void;
};

export function WideConnectionRow({ row, label, activity, onClose, onDelete }: ConnectionRowProperties) {
  return (
    <>
      <span className="connections-row-host">{row.host}</span>
      <span className="connections-row-owner">{row.ownerName}</span>
      <span className="connections-row-title">{label}</span>
      <span className="connections-row-status">{row.status}</span>
      <time className="connections-row-activity" dateTime={activity.dateTime}>{activity.text}</time>
      <ConnectionRowActions row={row} label={label} onClose={onClose} onDelete={onDelete} />
    </>
  );
}

export function NarrowConnectionRow({ row, label, activity, onClose, onDelete }: ConnectionRowProperties) {
  return (
    <>
      <div className="connections-row-primary">
        <span className="connections-row-title">{label}</span>
        <ConnectionRowActions row={row} label={label} onClose={onClose} onDelete={onDelete} />
      </div>
      <div className="connections-row-secondary">
        <span className="connections-row-status">{row.status}</span>
        <span className="connections-row-host">{row.host}</span>
        <span className="connections-row-owner">{row.ownerName}</span>
        <time className="connections-row-activity" dateTime={activity.dateTime}>{activity.text}</time>
      </div>
    </>
  );
}
