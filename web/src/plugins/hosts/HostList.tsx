import React, { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotate } from '@fortawesome/free-solid-svg-icons';
import type { HostRow, HostsPayload } from '@shared/plugins/hosts/shared';
import {
  fireIntent,
  nextListSelection,
  PluginActionsHeader,
  useListSelection,
  type TabPluginClientCapabilities,
} from '../api';
import {
  hostClickSelection, hostIdentity, hostTooltip, type HostIdentity,
} from './hosts-keys';

export function HostList({
  payload,
  capabilities,
}: {
  payload: HostsPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const { listRef, selected, rowClicked, navigate } = useListSelection(payload.rows.length);
  const lastClicked = useRef<HostIdentity | null>(null);

  const wasActive = useRef(capabilities.active);
  const { active, intent } = capabilities;
  useEffect(() => {
    if (active) {
      listRef.current?.focus();
      if (!wasActive.current) fireIntent({ intent }, 'refresh', {});
    }
    wasActive.current = active;
  }, [active, intent, listRef]);

  const refresh = () => { fireIntent({ intent }, 'refresh', {}); };
  const open = (row: HostRow) => { fireIntent({ intent }, 'open', { name: row.name }); };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
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
            <span />
          </div>
        ))}
      </div>
    </div>
  );
}
