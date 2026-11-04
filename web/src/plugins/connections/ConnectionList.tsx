import React, { useEffect, useState } from 'react';
import type { ConnectionRow, LiveConnectionRow, RecordConnectionRow } from '@shared/plugins/connections/shared';
import { ConfirmDialog, useListSelection, type TabPluginClientCapabilities } from '../api';
import {
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

function canClose(row: ConnectionRow): row is LiveConnectionRow | RecordConnectionRow {
  return row.type === 'live' || (row.kind === 'acp' && ['Running', 'Idle'].includes(row.status));
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
  return (
    <div className="connections-list plugin-tab" ref={selection.listRef} tabIndex={0} onKeyDown={onKeyDown}>
      {rows.length === 0 && <div className="connections-empty">No connections yet</div>}
      {controller.error && <div className="connections-list-error" role="alert">{controller.error}</div>}
      <div className="connections-rows">
        {rows.map((row, index) => {
          const label = rowTitle(row);
          const closedRecord = row.type === 'record' && row.kind === 'acp' && row.status === 'Closed';
          return (
            <div
              key={connectionRowIdentity(row)}
              className={`connections-row${selection.selected === index ? ' selected' : ''}`}
              data-index={index}
              role="button"
              tabIndex={-1}
              onClick={() => { clickRow(index); }}
            >
              <span className="connections-row-title">{label}</span>
              <span className="connections-row-kind">{row.kind}</span>
              <span className="connections-row-owner">{row.ownerName}</span>
              <span className="connections-row-status">{row.status}</span>
              {canClose(row) && (
                <button
                  type="button"
                  aria-label={`Close ${label}`}
                  onClick={(event) => { event.stopPropagation(); controller.close(row); }}
                >Close</button>
              )}
              {closedRecord && (
                <button
                  type="button"
                  aria-label={`Delete ${label}`}
                  onClick={(event) => { event.stopPropagation(); setPendingDelete(row); }}
                >Delete</button>
              )}
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
