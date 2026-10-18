import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { NameIntent, ScriptsPayload } from '@shared/plugins/scripts/shared';
import { PluginActionsHeader, newTabIcon, nextListSelection, type TabPluginClientCapabilities } from '../api';
import { keyMeaning, rowIndexOf } from './scripts-keys';
import { ScriptRows } from './ScriptRows';

export function ScriptsTab({ payload, capabilities }: {
  payload: ScriptsPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const { rows } = payload;
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = rowIndexOf(rows, selectedName);

  useEffect(() => {
    if (selected === null) return;
    containerRef.current?.querySelector(`[data-index="${CSS.escape(String(selected))}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const selectRow = (name: string) => {
    setSelectedName(name);
    containerRef.current?.focus();
  };

  const openRow = (name: string) => {
    const intent: NameIntent = { name };
    void capabilities.intent('open', intent);
  };

  const createScript = () => {
    void capabilities.intent('create', {});
  };

  const moveSelection = (index: number | null) => {
    setSelectedName(index === null ? null : (rows[index]?.name ?? null));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const meaning = keyMeaning(event.key);
    if (meaning === 'move') {
      event.preventDefault();
      event.stopPropagation();
      moveSelection(nextListSelection(rows.length, selected, event.key));
      return;
    }
    if (meaning === 'open' && selectedName !== null && selected !== null) {
      event.preventDefault();
      event.stopPropagation();
      openRow(selectedName);
    }
  };

  return (
    <div className="scripts-tab" ref={containerRef} tabIndex={0} onKeyDown={onKeyDown}>
      <PluginActionsHeader className="scripts-header">
        <span className="plugin-actions">
          <button type="button" title="New script" aria-label="New script" onClick={createScript}>
            <FontAwesomeIcon icon={newTabIcon} />
          </button>
          {capabilities.splitAction}
        </span>
      </PluginActionsHeader>
      {rows.length === 0 ? (
        <div className="scripts-empty">No runscripts yet. Press + to create one.</div>
      ) : (
        <ScriptRows rows={rows} selectedIndex={selected} onSelect={selectRow} onOpen={openRow} />
      )}
    </div>
  );
}
