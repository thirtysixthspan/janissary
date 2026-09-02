import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import type {
  ChatSummary,
  ConversationListPayload,
} from '@shared/plugins/chat/shared';
import type { TabPluginClientCapabilities } from '../api';
import { nextChatSelection } from './chat-keys';
import { DeleteConversationDialog } from './DeleteConversationDialog';

const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

export function ConversationList({
  payload,
  capabilities,
}: {
  payload: ConversationListPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const [selected, setSelected] = useState<number | null>(
    payload.entries.length === 0 ? null : 0,
  );
  const [pendingDelete, setPendingDelete] = useState<ChatSummary | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (capabilities.active) listRef.current?.focus();
  }, [capabilities.active]);

  useEffect(() => {
    if (selected === null) return;
    listRef.current?.querySelector(`[data-index="${CSS.escape(String(selected))}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useEffect(() => {
    if (payload.entries.length === 0) setSelected(null);
    else if (selected === null) setSelected(0);
    else if (selected >= payload.entries.length) setSelected(payload.entries.length - 1);
  }, [payload.entries.length, selected]);

  const open = (id: string) => { void capabilities.intent('open', { id }); };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (NAVIGATION_KEYS.has(event.key)) {
      event.preventDefault();
      setSelected(nextChatSelection(payload.entries.length, selected, event.key));
      return;
    }
    if (event.key === 'Enter' && selected !== null) {
      event.preventDefault();
      open(payload.entries[selected].id);
    }
  };

  return (
    <div className="chat-list plugin-tab" ref={listRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="plugin-meta chat-list-header">
        <span className="plugin-actions">
          <button
            type="button"
            title="New conversation"
            onClick={() => { void capabilities.intent('create', {}); }}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
          {capabilities.splitAction}
        </span>
      </div>
      {payload.entries.length === 0 && <div className="chat-empty">No conversations yet</div>}
      <div className="chat-rows">
        {payload.entries.map((entry, index) => (
          <div
            key={entry.id}
            className={`chat-row${selected === index ? ' selected' : ''}`}
            data-index={index}
            role="button"
            tabIndex={-1}
            onClick={() => {
              const shouldOpen = selected === index;
              setSelected(index);
              listRef.current?.focus();
              if (shouldOpen) open(entry.id);
            }}
          >
            <span className="chat-row-title">{entry.title}</span>
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
        <DeleteConversationDialog
          title={pendingDelete.title}
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
