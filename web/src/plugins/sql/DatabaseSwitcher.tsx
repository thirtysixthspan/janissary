import React from 'react';
import type { SqlPayload } from '@shared/plugins/sql/shared';

// The header's database switcher: every database the registry knows, and nothing else. Making one is
// `db sqlite create <name>` and has always been — a name in front of a user is a name that can be a
// typo, and the `sql` command refuses an unknown one for that reason, so the switcher refuses the
// same names for the same reason.
export function DatabaseSwitcher({ payload, onOpen }: {
  payload: SqlPayload;
  onOpen(name: string): void;
}) {
  return (
    <select
      className="sql-database"
      value={payload.database}
      onChange={(event) => onOpen(event.target.value)}
      aria-label="Database"
    >
      {payload.databases.length === 0 && <option value={payload.database}>{payload.database}</option>}
      {payload.databases.map((entry) => (
        <option key={entry.name} value={entry.name}>
          {entry.name}{entry.open ? ' •' : ''}
        </option>
      ))}
    </select>
  );
}
