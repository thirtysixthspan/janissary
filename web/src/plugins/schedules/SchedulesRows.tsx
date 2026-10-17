import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash } from '@fortawesome/free-solid-svg-icons';
import type { ScheduleRow } from '@shared/plugins/schedules/shared';
import { scheduleRowKey } from './schedules-keys';

// One section of the schedules list: its own column-heading row followed by its rows. `offset` is the
// section's first position in the flat, on-screen order, so numbering and selection indexes continue
// across sections. The heading row ends in a trash icon that clears this section's owner. An empty
// section renders nothing.
export function ScheduleSection({
  owner, entries, offset, compact, selected, onRowClick, onRowDoubleClick, onClear,
}: {
  owner: 'system' | 'tab';
  entries: ScheduleRow[];
  offset: number;
  compact: boolean;
  selected: number | null;
  onRowClick: (index: number) => void;
  onRowDoubleClick: (entry: ScheduleRow) => void;
  onClear: () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <div className="schedules-section">
      <div className="schedules-headings">
        {compact ? <CompactHeadings /> : <FullHeadings />}
        <button
          type="button"
          className="schedules-clear"
          aria-label={owner === 'system' ? 'Clear system schedules' : 'Clear tab schedules'}
          onClick={onClear}
        >
          <FontAwesomeIcon icon={faTrash} />
        </button>
      </div>
      {entries.map((entry, i) => {
        const index = offset + i;
        return (
          <div
            key={scheduleRowKey(entry)}
            role="button"
            tabIndex={-1}
            aria-selected={index === selected}
            className={`schedules-row${entry.recurring ? ' recurring' : ''}${index === selected ? ' selected' : ''}`}
            data-index={index}
            onClick={() => onRowClick(index)}
            onDoubleClick={() => onRowDoubleClick(entry)}
          >
            <span className="schedules-num">{index + 1})</span>
            {compact ? <CompactRow entry={entry} /> : <FullRow entry={entry} />}
          </div>
        );
      })}
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
      <span className="schedules-owner" title={entry.tab}>{entry.tab}</span>
      <span className="schedules-id" title={entry.id}>{entry.id}</span>
      <span className="schedules-next" title={entry.next}>{entry.next}</span>
      <span className="schedules-spec" title={entry.spec}>{entry.spec}</span>
      <span className="schedules-command" title={entry.command}>{entry.command}</span>
    </>
  );
}

function CompactRow({ entry }: { entry: ScheduleRow }) {
  return (
    <>
      <span className="schedules-next" title={entry.next}>{entry.next.split(' ').pop()}</span>
      <span className="schedules-id" title={entry.id}>{entry.id}</span>
      <span className="schedules-owner" title={entry.tab}>{entry.tab}</span>
    </>
  );
}
