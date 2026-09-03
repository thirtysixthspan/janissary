import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
import type {
  ConversationSummary,
  ConversationListPayload,
} from '@shared/plugins/conversations/shared';
import type { TabPluginClientCapabilities } from '../api';
import { conversationClickSelection, nextConversationSelection } from './conversation-list-keys';
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
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (capabilities.active) listRef.current?.focus();
  }, [capabilities.active]);

  useEffect(() => {
    if (selected === null) return;
    listRef.current?.querySelector(`[data-index="${CSS.escape(String(selected))}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useEffect(() => { setConfirmed(null); }, [payload.entries.length]);

  useEffect(() => {
    if (payload.entries.length === 0) setSelected(null);
    else if (selected === null) setSelected(0);
    else if (selected >= payload.entries.length) setSelected(payload.entries.length - 1);
  }, [payload.entries.length, selected]);

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
    if (NAVIGATION_KEYS.has(event.key)) {
      event.preventDefault();
      setSelected(nextConversationSelection(payload.entries.length, selected, event.key));
      setConfirmed(null);
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
              const click = conversationClickSelection(index, confirmed);
              setSelected(click.selected);
              setConfirmed(click.selected);
              listRef.current?.focus();
              if (click.opens) open(entry.id);
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
