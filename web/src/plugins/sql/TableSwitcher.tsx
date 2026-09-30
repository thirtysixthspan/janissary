import React from 'react';
import type { SqlPayload } from '@shared/plugins/sql/shared';

// The metadata row's table dropdown: every object in the database, grouped by kind, with the one on
// screen marked. It is the schema navigator in the form a select can take, which is what a metadata
// row can hold — and the database dropdown beside it is the same control one level up.
//
// Reloading is not this component's work: choosing a database opens a tab whose payload carries that
// database's objects, and the server reads the schema before the tab is shown, so new options arrive
// with the new payload rather than being asked for here.
//
// A trigger is offered and cannot be chosen. The navigator said so in words beside the row; a
// `disabled` option says the same thing in the only way a select can.

const GROUP_LABELS = [
  { kind: 'table', label: 'Tables' },
  { kind: 'view', label: 'Views' },
  { kind: 'index', label: 'Indexes' },
  { kind: 'trigger', label: 'Triggers' },
] as const;

const BROWSABLE = new Set<string>(['table', 'view']);

export function TableSwitcher({ payload, onOpen }: {
  payload: SqlPayload;
  onOpen(object: string): void;
}) {
  const groups = GROUP_LABELS
    .map(({ kind, label }) => ({ kind, label, entries: payload.objects.filter((object) => object.kind === kind) }))
    .filter((group) => group.entries.length > 0);

  return (
    <select
      className="sql-table"
      value={payload.object}
      onChange={(event) => onOpen(event.target.value)}
      aria-label="Table"
    >
      {groups.length === 0 && <option value={payload.object}>{payload.object}</option>}
      {groups.map((group) => (
        <optgroup key={group.kind} label={group.label}>
          {group.entries.map((object) => (
            <option key={object.name} value={object.name} disabled={!BROWSABLE.has(object.kind)}>
              {object.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
