import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotate } from '@fortawesome/free-solid-svg-icons';
import type { ConnectionRow, RecordConnectionRow } from '@shared/plugins/connections/shared';
import {
  ConfirmDialog,
  PluginActionsHeader,
  useListSelection,
  type TabPluginClientCapabilities,
} from '../api';
import { ConnectionRowActions } from './ConnectionRowActions';
import {
  connectionActivity,
  connectionClickSelection,
  connectionKeyboardNavigation,
  connectionListOrder,
  connectionRowIdentity,
  nextConnectionSelection,
  type ConnectionClickConfirmation,
} from './connection-list-keys';
import { useConnectionsController } from './useConnectionsController';

function rowTitle(row: ConnectionRow): string {
  return row.type === 'live' ? row.display : row.title;
}


export function ConnectionList({
  rows,
  capabilities,
}: {
  rows: ConnectionRow[];
  capabilities: TabPluginClientCapabilities;
}) {
  const selection = useListSelection(rows.length);
  const controller = useConnectionsController(capabilities);
  const [confirmed, setConfirmed] = useState<ConnectionClickConfirmation | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RecordConnectionRow | null>(null);
  const order = connectionListOrder(rows);

  useEffect(() => {
    if (capabilities.active) selection.listRef.current?.focus();
  }, [capabilities.active, selection.listRef]);
  useEffect(() => { setConfirmed(null); }, [order]);
  useEffect(() => {
    if (pendingDelete === null) return;
    const identity = connectionRowIdentity(pendingDelete);
    if (rows.every((row) => connectionRowIdentity(row) !== identity)) setPendingDelete(null);
  }, [pendingDelete, rows]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target !== event.currentTarget && target.getAttribute('role') !== 'button') return;
    const navigation = connectionKeyboardNavigation(rows.length, selection.selected, event.key);
    if (navigation) {
      selection.navigate(event.key, nextConnectionSelection);
      setConfirmed(navigation.confirmation);
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && selection.selected !== null) {
      event.preventDefault();
      controller.open(rows[selection.selected]);
    }
  };

  const clickRow = (index: number) => {
    const click = connectionClickSelection(index, rows, confirmed);
    selection.select(index);
    selection.listRef.current?.focus();
    setConfirmed(click.confirmation);
    if (click.opens) controller.open(rows[index]);
  };

  const title = pendingDelete === null ? '' : rowTitle(pendingDelete);
  const now = Date.now();
  return (
    <div className="connections-list plugin-tab" ref={selection.listRef} tabIndex={0} onKeyDown={onKeyDown}>
      <PluginActionsHeader className="plugin-meta connections-list-header">
        <span className="plugin-actions">
          <button type="button" title="Refresh" aria-label="Refresh" onClick={controller.refresh}>
            <FontAwesomeIcon icon={faRotate} />
          </button>
          {capabilities.splitAction}
        </span>
      </PluginActionsHeader>
      {rows.length === 0 && <div className="connections-empty">No connections yet</div>}
      {controller.error && <div className="connections-list-error" role="alert">{controller.error}</div>}
      {rows.length > 0 && (
        <div className="connections-columns" aria-hidden="true">
          <span className="connections-columns-host">Host</span>
          <span className="connections-columns-owner">Tab</span>
          <span className="connections-columns-title">Connection Name</span>
          <span className="connections-columns-status">Connection State</span>
          <span className="connections-columns-activity">Last activity</span>
          <span />
        </div>
      )}
      <div className="connections-rows">
        {rows.map((row, index) => {
          const label = rowTitle(row);
          const activity = connectionActivity(row.orderingTimestamp, now);
          return (
            <div
              key={connectionRowIdentity(row)}
              className={`connections-row${selection.selected === index ? ' selected' : ''}`}
              data-index={index}
              role="button"
              tabIndex={-1}
              title={`${label}\n${row.kind}`}
              onClick={() => { clickRow(index); }}
            >
              <span className="connections-row-host">{row.host}</span>
              <span className="connections-row-owner">{row.ownerName}</span>
              <span className="connections-row-title">{label}</span>
              <span className="connections-row-status">{row.status}</span>
              <time className="connections-row-activity" dateTime={activity.dateTime}>{activity.text}</time>
              <ConnectionRowActions
                row={row}
                label={label}
                onClose={controller.close}
                onDelete={setPendingDelete}
              />
            </div>
          );
        })}
      </div>
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete "${title}"?`}
          confirmLabel="Delete"
          onCancel={() => { setPendingDelete(null); }}
          onConfirm={() => { controller.delete(pendingDelete.id); setPendingDelete(null); }}
        />
      )}
    </div>
  );
}
