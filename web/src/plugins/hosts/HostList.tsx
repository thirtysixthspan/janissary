import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faRotate } from '@fortawesome/free-solid-svg-icons';
import type { HostRow, HostsPayload } from '@shared/plugins/hosts/shared';
import {
  ConfirmDialog,
  fireIntent,
  nextListSelection,
  PluginActionsHeader,
  useListSelection,
  type TabPluginClientCapabilities,
} from '../api';
import { HostForm } from './HostForm';
import { HostRowActions, type HostRowAction } from './HostRowActions';
import {
  hostClickSelection, hostIdentity, hostTooltip, type HostIdentity,
} from './hosts-keys';

async function settleDelete(intent: TabPluginClientCapabilities['intent'], name: string): Promise<void> {
  try {
    await intent('delete', { name });
  } catch {
    return;
  }
}

export function HostList({
  payload,
  capabilities,
}: {
  payload: HostsPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const { listRef, selected, rowClicked, navigate, select } = useListSelection(payload.rows.length);
  const lastClicked = useRef<HostIdentity | null>(null);
  const [editing, setEditing] = useState<HostRow | 'new' | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HostRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [focusName, setFocusName] = useState<string | null>(null);

  const wasActive = useRef(capabilities.active);
  const { active, intent } = capabilities;
  useEffect(() => {
    if (active) {
      listRef.current?.focus();
      if (!wasActive.current) fireIntent({ intent }, 'refresh', {});
    }
    wasActive.current = active;
  }, [active, intent, listRef]);

  useEffect(() => {
    if (focusName === null) return;
    const index = payload.rows.findIndex((row) => row.name === focusName);
    if (index === -1) return;
    select(index);
    lastClicked.current = null;
    if (capabilities.active) listRef.current?.focus();
    setFocusName(null);
  }, [focusName, payload.rows, select, capabilities.active, listRef]);

  const refresh = () => { fireIntent({ intent }, 'refresh', {}); };
  const open = (row: HostRow) => { fireIntent({ intent }, 'open', { name: row.name }); };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
      && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      event.stopPropagation();
      setEditing('new');
      return;
    }
    if (navigate(event.key, nextListSelection)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && selected !== null) {
      event.preventDefault();
      open(payload.rows[selected]);
    }
  };

  const onRowClick = (index: number, row: HostRow) => {
    const current = hostIdentity(row, payload.filePath);
    const opens = rowClicked(index, (clicked, confirmed) =>
      hostClickSelection(clicked, confirmed, lastClicked.current, current));
    lastClicked.current = current;
    if (opens) open(row);
  };

  const onRowAction = (row: HostRow, action: HostRowAction) => {
    if (action === 'edit') setEditing(row);
    else setPendingDelete(row);
  };

  const confirmDelete = async () => {
    if (pendingDelete === null || deleting) return;
    setDeleting(true);
    await settleDelete(intent, pendingDelete.name);
    setDeleting(false);
    setPendingDelete(null);
  };

  const cancelDelete = () => { if (!deleting) setPendingDelete(null); };
  const onHostSaved = (name: string) => { setEditing(null); setFocusName(name); };

  return (
    <div
      className="host-list plugin-tab"
      ref={listRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-doc-shot="hosts-list"
    >
      <PluginActionsHeader className="plugin-meta host-list-header">
        <span className="plugin-actions">
          <button type="button" title="Refresh" aria-label="Refresh" onClick={refresh}>
            <FontAwesomeIcon icon={faRotate} />
          </button>
          <button type="button" title="New host" aria-label="New host" onClick={() => setEditing('new')}>
            <FontAwesomeIcon icon={faPlus} />
          </button>
          {capabilities.splitAction}
        </span>
      </PluginActionsHeader>
      {payload.rows.length === 0 && <div className="host-empty">No saved hosts</div>}
      {payload.rows.length > 0 && (
        <div className="host-columns" aria-hidden="true">
          <span>Name</span>
          <span>User</span>
          <span>Destination</span>
          <span>Path</span>
          <span />
        </div>
      )}
      <div className="host-rows">
        {payload.rows.map((row, index) => (
          <div
            key={row.name}
            className={`host-row${selected === index ? ' selected' : ''}`}
            data-index={index}
            role="button"
            tabIndex={-1}
            title={hostTooltip(row.user, row.destination, row.path)}
            onClick={() => { onRowClick(index, row); }}
          >
            <span className="host-row-name">{row.name}</span>
            <span className="host-row-user">{row.user}</span>
            <span className="host-row-destination">{row.destination}</span>
            <span className="host-row-path">{row.path}</span>
            <HostRowActions name={row.name} onAction={(action) => onRowAction(row, action)} />
          </div>
        ))}
      </div>
      {editing !== null && (
        <HostForm
          initial={editing === 'new' ? undefined : editing}
          intent={intent}
          onSaved={onHostSaved}
          onCancel={() => setEditing(null)}
        />
      )}
      {pendingDelete !== null && (
        <ConfirmDialog
          title={`Delete host ${pendingDelete.name}?`}
          confirmLabel="Delete"
          confirmDisabled={deleting}
          onConfirm={() => { void confirmDelete(); }}
          onCancel={cancelDelete}
        />
      )}
    </div>
  );
}
