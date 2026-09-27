import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import type { VisualizationListPayload } from '@shared/plugins/visualizations/shared';
import {
  ConfirmDialog, nextListSelection, useListSelection, type TabPluginClientCapabilities,
} from '../api';

// The index of saved visualizations, which is a conversations list with one control changed: the plus
// becomes a source field, because the thing a user needs here is not "make an empty one" but "point at
// something". The selection, the two-click open, the empty state, and the delete confirmation are the
// shared ones, because a list of records that behaves differently from every other list of records is a
// list nobody can predict.
export function VisualizationList({
  payload,
  capabilities,
}: {
  payload: VisualizationListPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const { listRef, selected, rowClicked, navigate } = useListSelection(payload.entries.length);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; title: string } | null>(null);
  const [source, setSource] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (capabilities.active) listRef.current?.focus();
  }, [capabilities.active, listRef]);

  const create = (line: string) => {
    if (line.trim() === '') return;
    void capabilities.intent('create', { source: line.trim() });
    setSource('');
    setCreating(false);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
      && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      event.stopPropagation();
      setCreating(true);
      return;
    }
    if (navigate(event.key, nextListSelection)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && selected !== null) {
      event.preventDefault();
      void capabilities.intent('open', { id: payload.entries[selected]?.id });
    }
  };

  return (
    <div className="visualization-list plugin-tab" ref={listRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="plugin-meta visualization-list-header">
        {creating ? (
          <form
            className="visualization-source-form"
            onSubmit={(event) => { event.preventDefault(); create(source); }}
          >
            <input
              type="text"
              value={source}
              placeholder="URL or file path"
              aria-label="Data source"
              autoFocus
              onChange={(event) => { setSource(event.target.value); }}
              onKeyDown={(event) => { if (event.key === 'Escape') setCreating(false); }}
            />
            <button type="submit" disabled={source.trim() === ''}>Visualize</button>
          </form>
        ) : (
          <span className="plugin-actions">
            <button type="button" title="New visualization" onClick={() => { setCreating(true); }}>
              <FontAwesomeIcon icon={faPlus} />
            </button>
            {capabilities.splitAction}
          </span>
        )}
      </div>
      {payload.entries.length === 0 && !creating
        ? <div className="visualization-empty">No visualizations yet</div>
        : null}
      <div className="visualization-rows">
        {payload.entries.map((entry, index) => (
          <div
            key={entry.id}
            className={`visualization-row${selected === index ? ' selected' : ''}`}
            data-index={index}
            role="button"
            tabIndex={-1}
            onClick={() => {
              // A first click only moves the current row; the second one opens it, which holds for the
              // row that was current when the list opened and for one the arrows moved to.
              if (rowClicked(index, (at, confirmed) => ({ selected: at, opens: confirmed === at }))) {
                void capabilities.intent('open', { id: entry.id });
              }
            }}
          >
            <span className="visualization-row-title">{entry.title}</span>
            <time dateTime={new Date(entry.updatedAt).toISOString()}>
              {new Date(entry.updatedAt).toLocaleString()}
            </time>
            <button
              type="button"
              aria-label={`Delete ${entry.title}`}
              onClick={(event) => { event.stopPropagation(); setPendingDelete(entry); }}
            >
              <FontAwesomeIcon icon={faTrash} />
            </button>
          </div>
        ))}
      </div>
      {pendingDelete ? (
        <ConfirmDialog
          title={`Delete visualization "${pendingDelete.title}"?`}
          confirmLabel="Delete"
          onCancel={() => { setPendingDelete(null); }}
          onConfirm={() => {
            void capabilities.intent('delete', { id: pendingDelete.id });
            setPendingDelete(null);
          }}
        />
      ) : null}
    </div>
  );
}