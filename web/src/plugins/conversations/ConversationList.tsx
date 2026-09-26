import React, { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import type {
  ConversationSummary,
  ConversationListPayload,
} from '@shared/plugins/conversations/shared';
import {
  ConfirmDialog,
  useListSelection,
  type TabPluginClientCapabilities,
} from '../api';
import { conversationClickSelection, nextConversationSelection } from './conversation-list-keys';

export function ConversationList({
  payload,
  capabilities,
}: {
  payload: ConversationListPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const { listRef, selected, rowClicked, navigate } = useListSelection(payload.entries.length);
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null);

  useEffect(() => {
    if (capabilities.active) listRef.current?.focus();
  }, [capabilities.active, listRef]);

  const create = () => { void capabilities.intent('create', {}); };
  const open = (id: string) => { void capabilities.intent('open', { id }); };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && !event.shiftKey && !event.altKey
      && event.key.toLowerCase() === 'n') {
      event.preventDefault();
      event.stopPropagation();
      create();
      return;
    }
    if (navigate(event.key, nextConversationSelection)) {
      event.preventDefault();
      return;
    }
    if (event.key === 'Enter' && selected !== null) {
      event.preventDefault();
      open(payload.entries[selected].id);
    }
  };

  return (
    <div className="conversation-list plugin-tab" ref={listRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="plugin-meta conversation-list-header">
        <span className="plugin-actions">
          <button
            type="button"
            title="New conversation"
            onClick={create}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
          {capabilities.splitAction}
        </span>
      </div>
      {payload.entries.length === 0 && <div className="conversation-empty">No conversations yet</div>}
      <div className="conversation-rows">
        {payload.entries.map((entry, index) => (
          <div
            key={entry.id}
            className={`conversation-row${selected === index ? ' selected' : ''}`}
            data-index={index}
            role="button"
            tabIndex={-1}
            onClick={() => {
              if (rowClicked(index, conversationClickSelection)) open(entry.id);
            }}
          >
            <span className="conversation-row-title">{entry.title}</span>
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
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete conversation "${pendingDelete.title}"?`}
          confirmLabel="Delete"
          onCancel={() => { setPendingDelete(null); }}
          onConfirm={() => {
            void capabilities.intent('delete', { id: pendingDelete.id });
            setPendingDelete(null);
          }}
        />
      )}
    </div>
  );
}
