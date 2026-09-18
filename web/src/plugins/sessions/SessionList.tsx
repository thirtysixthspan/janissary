import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotate } from '@fortawesome/free-solid-svg-icons';
import type { SessionRow, SessionRowAction, SessionsPayload } from '@shared/plugins/sessions/shared';
import { ConfirmDialog, type TabPluginClientCapabilities } from '../api';
import { SessionRowActions } from './SessionRowActions';
import { openIntentFor, relativeActivity, sessionClickSelection, nextSessionSelection } from './sessions-keys';

const NAVIGATION_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

// Detach and end are the two that take something away — tabs in one case, a remote workspace in the
// other — so both ask first. Forget has no dialog: it removes a record and touches nothing.
const CONFIRMATIONS: Partial<Record<SessionRowAction, { verb: string; button: string }>> = {
  detach: { verb: 'Detach', button: 'Detach' },
  end: { verb: 'End', button: 'End session' },
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

  const raise = (action: SessionRowAction, row: SessionRow) => {
    void capabilities.intent(action, { id: row.id });
  };

  const request = (action: SessionRowAction, row: SessionRow) => {
    if (CONFIRMATIONS[action] !== undefined) { setPending({ row, action }); return; }
    raise(action, row);
  };

  // Opening a row focuses it, or reattaches it. An ended row does nothing: there is nothing left to
  // focus and nothing left to come back to.
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

  return (
    <div className="session-list plugin-tab" ref={listRef} tabIndex={0} onKeyDown={onKeyDown}>
      <div className="plugin-meta session-list-header">
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
      </div>
      {payload.entries.length === 0 && <div className="session-empty">No remote sessions</div>}
      <div className="session-rows">
        {payload.entries.map((row, index) => (
          <div
            key={row.id}
            className={`session-row${selected === index ? ' selected' : ''}${row.joined ? ' joined' : ''}`}
            data-index={index}
            data-state={row.state}
            role="button"
            tabIndex={-1}
            title={`${row.destination}${row.workspace ? `\n${row.workspace}` : ''}${row.failure ? `\n${row.failure}` : ''}`}
            onClick={() => {
              const click = sessionClickSelection(index, confirmed);
              setSelected(click.selected);
              setConfirmed(click.selected);
              listRef.current?.focus();
              if (click.opens) open(row);
            }}
          >
            <span className="session-row-host">{row.host}</span>
            <span className="session-row-name">{row.name}</span>
            <span className="session-row-kind">{row.kind}</span>
            <span className="session-row-state">{row.state}</span>
            <time className="session-row-activity" dateTime={new Date(row.activity).toISOString()}>
              {relativeActivity(row.activity, now)}
            </time>
            <SessionRowActions row={row} onAction={(action) => { request(action, row); }} />
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
