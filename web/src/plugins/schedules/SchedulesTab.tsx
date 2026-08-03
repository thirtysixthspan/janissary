import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import type { ScheduleRow, SchedulesPayload } from '@shared/plugins/schedules/shared';
import type { TabPluginClientCapabilities } from '../api';
import { nextSelection } from './schedules-keys';
import { DeleteScheduleDialog } from './DeleteScheduleDialog';

const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

// The aggregated schedules list: every scheduled command across all tabs, ordered next-to-run
// first. Read-only apart from selection: a single click selects a row, a double click (or Enter on
// the selected row) focuses the tab that owns it. Arrow Up/Down/Home/End move the selection.
// Rendered full-width in the main area, or as a compressed one-line-per-entry list when the host
// reports the tab docked; both layouts share the same selection and focus behavior. The dock-cycle
// control is host chrome and is deliberately absent here.
export function SchedulesTab({
  payload, capabilities,
}: {
  payload: SchedulesPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const entries = payload.entries;
  const [selected, setSelected] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ScheduleRow | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const compact = capabilities.dock !== null;

  useEffect(() => {
    if (selected === null) return;
    containerRef.current?.querySelector(`[data-index="${CSS.escape(String(selected))}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  useEffect(() => {
    if (selected !== null && selected >= entries.length) setSelected(entries.length === 0 ? null : entries.length - 1);
  }, [entries.length, selected]);

  const focusOwner = (tab: string) => { void capabilities.intent('focus-owner', { tab }); };

  const onRowClick = (i: number) => {
    setSelected(i);
    containerRef.current?.focus();
  };

  const confirmDelete = () => {
    if (pendingDelete) void capabilities.intent('cancel', { tab: pendingDelete.tab, id: pendingDelete.id });
    setPendingDelete(null);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (NAV_KEYS.has(e.key)) {
      e.preventDefault();
      e.stopPropagation();
      setSelected(nextSelection(entries.length, selected, e.key));
      return;
    }
    if ((e.key === 'Backspace' || e.key === 'Delete') && selected !== null) {
      e.preventDefault();
      e.stopPropagation();
      setPendingDelete(entries[selected]);
      return;
    }
    if (e.key === 'Enter' && selected !== null) {
      e.preventDefault();
      e.stopPropagation();
      focusOwner(entries[selected].tab);
    }
  };

  return (
    <div
      className={`schedules-tab${compact ? ' schedules-compact' : ''}`}
      ref={containerRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      data-doc-shot="schedules-tab"
    >
      <div className="schedules-header">
        <div className="schedules-actions">
          {capabilities.splitAction}
          <button
            type="button"
            className="schedules-clear"
            aria-label="Clear all schedules"
            disabled={entries.length === 0}
            onClick={() => { void capabilities.intent('clear', {}); }}
          >
            <FontAwesomeIcon icon={faTrash} />
          </button>
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="schedules-empty">No scheduled commands.</div>
      ) : (
        <>
          <div className="schedules-headings">
            {compact ? <CompactHeadings /> : <FullHeadings />}
          </div>
          {entries.map((entry, i) => (
            <div
              key={`${entry.tab}:${entry.id}`}
              role="button"
              tabIndex={-1}
              aria-selected={i === selected}
              className={`schedules-row${entry.recurring ? ' recurring' : ''}${i === selected ? ' selected' : ''}`}
              data-index={i}
              onClick={() => onRowClick(i)}
              onDoubleClick={() => focusOwner(entry.tab)}
            >
              <span className="schedules-num">{i + 1})</span>
              {compact ? <CompactRow entry={entry} /> : <FullRow entry={entry} />}
            </div>
          ))}
        </>
      )}
      {pendingDelete && (
        <DeleteScheduleDialog
          id={pendingDelete.id}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function FullHeadings() {
  return (
    <>
      <span className="schedules-num" />
      <span>Agent</span>
      <span>Id</span>
      <span>Next</span>
      <span>Spec</span>
      <span>Command</span>
    </>
  );
}

function CompactHeadings() {
  return (
    <>
      <span className="schedules-num" />
      <span>Next</span>
      <span>Id</span>
      <span>Agent</span>
    </>
  );
}

function FullRow({ entry }: { entry: ScheduleRow }) {
  return (
    <>
      <span className="schedules-owner">{entry.tab}</span>
      <span className="schedules-id">{entry.id}</span>
      <span className="schedules-next">{entry.next}</span>
      <span className="schedules-spec">{entry.spec}</span>
      <span className="schedules-command">{entry.command}</span>
    </>
  );
}

function CompactRow({ entry }: { entry: ScheduleRow }) {
  return (
    <>
      <span className="schedules-next">{entry.next.split(' ').pop()}</span>
      <span className="schedules-id">{entry.id}</span>
      <span className="schedules-owner">{entry.tab}</span>
    </>
  );
}
