import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { NameIntent, RunscriptRow, ScriptsPayload } from '@shared/plugins/scripts/shared';
import { PluginActionsHeader, newTabIcon, nextListSelection, type TabPluginClientCapabilities } from '../api';
import { DeleteScriptDialog } from './DeleteScriptDialog';
import { keyMeaning, nameAfterRemoval, rowIndexOf } from './scripts-keys';
import { ScriptRows } from './ScriptRows';
import type { RowAction } from './ScriptRowActions';

function ownsKey(event: React.KeyboardEvent) {
  return event.target === event.currentTarget
    || (event.target instanceof Element && event.target.classList.contains('scripts-row'));
}

export function ScriptsTab({ payload, capabilities }: {
  payload: ScriptsPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const { rows } = payload;
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RunscriptRow | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dismissedRef = useRef(false);
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

  const createScript = (event: React.MouseEvent<HTMLButtonElement>) => {
    // The second click of a double-click has detail 2. New script acts on the first click only, so a double-click creates one runscript.
    if (event.detail > 1) return;
    void capabilities.intent('create', {});
  };

  const moveSelection = (index: number | null) => {
    setSelectedName(index === null ? null : (rows[index]?.name ?? null));
  };

  const openDelete = (name: string) => {
    dismissedRef.current = false;
    setPendingDelete(rows.find((row) => row.name === name) ?? null);
  };

  const closeDelete = () => {
    dismissedRef.current = true;
    setPendingDelete(null);
    containerRef.current?.focus();
  };

  const swallowSecondClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (dismissedRef.current && event.detail > 1) {
      event.stopPropagation();
      return;
    }
    dismissedRef.current = false;
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      if (pendingDelete.name === selectedName) setSelectedName(nameAfterRemoval(rows, pendingDelete.name));
      const intent: NameIntent = { name: pendingDelete.name };
      void capabilities.intent('delete', intent);
    }
    closeDelete();
  };

  const runRowAction = (name: string, action: RowAction) => {
    if (action === 'delete') {
      openDelete(name);
      return;
    }
    const intent: NameIntent = { name };
    void capabilities.intent(action === 'run' ? 'execute' : 'clone', intent);
    containerRef.current?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!ownsKey(event)) return;
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
      return;
    }
    if (meaning === 'delete' && selectedName !== null && selected !== null) {
      event.preventDefault();
      event.stopPropagation();
      openDelete(selectedName);
    }
  };

  return (
    <div
      className="scripts-tab"
      data-doc-shot="scripts-tab"
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onClickCapture={swallowSecondClick}
      onDoubleClickCapture={swallowSecondClick}
    >
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
        <ScriptRows
          rows={rows}
          selectedIndex={selected}
          onSelect={selectRow}
          onOpen={openRow}
          onRowAction={runRowAction}
        />
      )}
      {pendingDelete && (
        <DeleteScriptDialog
          name={pendingDelete.name}
          schedules={pendingDelete.schedules}
          open={pendingDelete.open}
          onConfirm={confirmDelete}
          onCancel={closeDelete}
        />
      )}
    </div>
  );
}
