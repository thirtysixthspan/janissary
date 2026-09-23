import React from 'react';
import type { SessionRow, SessionRowAction } from '@shared/plugins/sessions/shared';
import { ConnectionPlug } from '../api';
import { SessionRowActions } from './SessionRowActions';
import { relativeActivity } from './sessions-keys';

type SessionRowProperties = {
  row: SessionRow;
  now: number;
  onAction(action: SessionRowAction): void;
};

export function WideSessionRow({ row, now, onAction }: SessionRowProperties) {
  return (
    <>
      <span className="session-row-host">{row.host}</span>
      <span className="session-row-kind">{row.kind}</span>
      <span className="session-row-name">{row.name}</span>
      <span className="session-row-state">
        <ConnectionPlug state={row.state} />
        {row.state}
      </span>
      <time className="session-row-activity" dateTime={new Date(row.activity).toISOString()}>
        {relativeActivity(row.activity, now)}
      </time>
      <SessionRowActions row={row} onAction={onAction} />
    </>
  );
}

export function NarrowSessionRow({ row, now, onAction }: SessionRowProperties) {
  return (
    <>
      <div className="session-row-primary">
        <span className="session-row-name">{row.name}</span>
        <SessionRowActions row={row} onAction={onAction} />
      </div>
      <div className="session-row-secondary">
        <span className="session-row-state">
          <ConnectionPlug state={row.state} />
          {row.state}
        </span>
        <span className="session-row-host">{row.host}</span>
        <time className="session-row-activity" dateTime={new Date(row.activity).toISOString()}>
          {relativeActivity(row.activity, now)}
        </time>
      </div>
    </>
  );
}
