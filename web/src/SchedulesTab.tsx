import React from 'react';
import type { AggregatedScheduleView, TabView } from '@shared/protocol';
import type { JanusClient } from './ws';

type Properties = {
  entries: AggregatedScheduleView[];
  tabs: TabView[];
  client: JanusClient;
  // Compressed one-line-per-entry layout, used when the tab is docked into a sidebar.
  compact?: boolean;
};

// The aggregated schedules tab: every scheduled command across all tabs, ordered next-to-run first.
// Read-only apart from clicking a row, which focuses the tab that owns that entry via setActiveTab.
// Rendered full-width in the main area, or as a compressed one-line-per-entry list when docked
// (`compact`); both layouts share the row-click-to-focus behavior.
export function SchedulesTab({ entries, tabs, client, compact = false }: Properties) {
  if (entries.length === 0) {
    return (
      <div className="schedules-tab">
        <div className="schedules-empty">No scheduled commands.</div>
      </div>
    );
  }
  const focusOwner = (label: string) => {
    const index = tabs.findIndex((t) => t.label === label);
    if (index !== -1) client.send({ method: 'setActiveTab', params: { index } });
  };
  return (
    <div className={`schedules-tab${compact ? ' schedules-compact' : ''}`}>
      {entries.map((entry) => (
        <button
          key={`${entry.tab}:${entry.id}`}
          type="button"
          className={`schedules-row${entry.recurring ? ' recurring' : ''}`}
          onClick={() => focusOwner(entry.tab)}
        >
          {compact ? <CompactRow entry={entry} /> : <FullRow entry={entry} />}
        </button>
      ))}
    </div>
  );
}

function FullRow({ entry }: { entry: AggregatedScheduleView }) {
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

function CompactRow({ entry }: { entry: AggregatedScheduleView }) {
  return (
    <>
      <span className="schedules-next">{entry.next}</span>
      <span className="schedules-id">{entry.id}</span>
      <span className="schedules-owner">{entry.tab}</span>
    </>
  );
}
