import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotate } from '@fortawesome/free-solid-svg-icons';
import type { SessionRow, SessionRowAction, SessionsPayload } from '@shared/plugins/sessions/shared';
import { ConfirmDialog, PluginActionsHeader, type TabPluginClientCapabilities } from '../api';
import { NarrowSessionRow, WideSessionRow } from './SessionRowBody';
import { openIntentFor, sessionClickSelection, nextSessionSelection } from './sessions-keys';

const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

// Detach and terminate are the two that take something away — tabs in one case, a remote workspace
// in the other — so both ask first. Forget has no dialog: it removes a record and touches nothing.
const CONFIRMATIONS: Partial<Record<SessionRowAction, { verb: string; button: string }>> = {
  detach: { verb: 'Detach', button: 'Detach' },
  terminate: { verb: 'Terminate', button: 'Terminate' },
};

export function SessionList({
  payload,
  capabilities,
}: {
  payload: SessionsPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const [selected, setSelected] = useState<number | null>(
    payload.entries.length === 0 ? null : 0,
  );
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [pending, setPending] = useState<{ row: SessionRow; action: SessionRowAction } | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Focus and refresh ride the same transition: becoming the active tab. The value the list first
  // renders with is what the command that opened it just read, so re-reading it on mount would be a
  // refresh nobody asked for — only a later return to the tab is news.
  const wasActive = useRef(capabilities.active);
  const { active, intent } = capabilities;
  useEffect(() => {
    if (active) {
      listRef.current?.focus();
      if (!wasActive.current) void intent('refresh', {});
    }
    wasActive.current = active;
  }, [active, intent]);

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

  const raise = (action: SessionRowAction, row: SessionRow) => {
    void capabilities.intent(action, { id: row.id });
  };

  const request = (action: SessionRowAction, row: SessionRow) => {
    if (CONFIRMATIONS[action] !== undefined) { setPending({ row, action }); return; }
    raise(action, row);
  };

  // Opening a row focuses it, or attaches it. A terminated row does nothing: there is nothing left
  // to focus and nothing left to come back to.
  const open = (row: SessionRow) => {
    const intent = openIntentFor(row.state, row.actions);
    if (intent) raise(intent, row);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (NAVIGATION_KEYS.has(event.key)) {
      event.preventDefault();
      setSelected(nextSessionSelection(payload.entries.length, selected, event.key));
      setConfirmed(null);
      return;
    }
    if (event.key === 'Enter' && selected !== null) {
      event.preventDefault();
      open(payload.entries[selected]);
    }
  };

  const now = Date.now();
  const narrow = capabilities.dock !== null;
  const RowBody = narrow ? NarrowSessionRow : WideSessionRow;

  return (
    <div className={`session-list plugin-tab${narrow ? ' session-list-narrow' : ''}`} ref={listRef} tabIndex={0} onKeyDown={onKeyDown}>
      <PluginActionsHeader className="plugin-meta session-list-header">
        <span className="plugin-actions">
          <button
            type="button"
            title="Refresh"
            aria-label="Refresh"
            onClick={() => { void capabilities.intent('refresh', {}); }}
          >
            <FontAwesomeIcon icon={faRotate} />
          </button>
          {capabilities.splitAction}
        </span>
      </PluginActionsHeader>
      {payload.entries.length === 0 && <div className="session-empty">No remote sessions</div>}
      {payload.entries.length > 0 && !narrow && (
        <div className="session-columns" aria-hidden="true">
          <span className="session-columns-host">Host</span>
          <span className="session-columns-kind">Type</span>
          <span className="session-columns-name">Tab</span>
          <span className="session-columns-state">State</span>
          <span className="session-columns-activity">Last activity</span>
          <span />
        </div>
      )}
      <div className="session-rows">
        {payload.entries.map((row, index) => (
          <div
            key={row.id}
            className={`session-row${selected === index ? ' selected' : ''}${row.joined ? ' joined' : ''}`}
            data-index={index}
            data-state={row.state}
            role="button"
            tabIndex={-1}
            title={`${row.destination}\n${row.kind}${row.workspace ? `\n${row.workspace}` : ''}${row.failure ? `\n${row.failure}` : ''}`}
            onClick={() => {
              const click = sessionClickSelection(index, confirmed);
              setSelected(click.selected);
              setConfirmed(click.selected);
              listRef.current?.focus();
              if (click.opens) open(row);
            }}
          >
            <RowBody row={row} now={now} onAction={(action) => { request(action, row); }} />
          </div>
        ))}
      </div>
      {pending && (
        <ConfirmDialog
          title={`${CONFIRMATIONS[pending.action]?.verb ?? ''} ${pending.row.name} on ${pending.row.host}?`}
          confirmLabel={CONFIRMATIONS[pending.action]?.button ?? ''}
          onCancel={() => { setPending(null); }}
          onConfirm={() => {
            raise(pending.action, pending.row);
            setPending(null);
          }}
        />
      )}
    </div>
  );
}
