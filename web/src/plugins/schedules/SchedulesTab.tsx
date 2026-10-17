import React, { useEffect, useRef, useState } from 'react';
import type { ScheduleRow, SchedulesPayload } from '@shared/plugins/schedules/shared';
import type { TabPluginClientCapabilities } from '../api';
import { nextSelection } from './schedules-keys';
import { sectionSchedules } from './schedules-sections';
import { ScheduleSection } from './SchedulesRows';
import { DeleteScheduleDialog } from './DeleteScheduleDialog';

const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End']);

// The aggregated schedules list: every scheduled command across all tabs. Project system schedules
// sit in their own section above the tab-owned ones, and each section is ordered next-to-run first
// with its own column headings. Read-only apart from selection: a single click selects a row, a
// double click (or Enter on the selected row) focuses the tab that owns it. Arrow Up/Down/Home/End
// move the selection through the on-screen order. Rendered full-width in the main area, or as a
// compressed one-line-per-entry list when the host reports the tab docked; both layouts share the
// same selection and focus behavior. The dock-cycle control is host chrome and is deliberately
// absent here.
export function SchedulesTab({
  payload, capabilities,
}: {
  payload: SchedulesPayload;
  capabilities: TabPluginClientCapabilities;
}) {
  const sections = sectionSchedules(payload.entries);
  const entries = sections.ordered;
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

  const focusOwner = (entry: ScheduleRow) => {
    const identity = entry.owner === 'system'
      ? { tab: entry.tab, owner: 'system', key: entry.key }
      : { tab: entry.tab };
    void capabilities.intent('focus-owner', identity);
  };

  const onRowClick = (i: number) => {
    setSelected(i);
    containerRef.current?.focus();
  };

  const confirmDelete = () => {
    if (pendingDelete) {
      const identity = pendingDelete.owner === 'system'
        ? { tab: pendingDelete.tab, owner: 'system', key: pendingDelete.key }
        : { tab: pendingDelete.tab };
      void capabilities.intent('cancel', { ...identity, id: pendingDelete.id });
    }
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
      focusOwner(entries[selected]);
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
        </div>
      </div>
      {entries.length === 0 ? (
        <div className="schedules-empty">No scheduled commands.</div>
      ) : (
        <>
          <ScheduleSection
            owner="system"
            entries={sections.system}
            offset={0}
            compact={compact}
            selected={selected}
            onRowClick={onRowClick}
            onRowDoubleClick={focusOwner}
            onDelete={setPendingDelete}
          />
          <ScheduleSection
            owner="tab"
            entries={sections.tabs}
            offset={sections.system.length}
            compact={compact}
            selected={selected}
            onRowClick={onRowClick}
            onRowDoubleClick={focusOwner}
            onDelete={setPendingDelete}
          />
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
