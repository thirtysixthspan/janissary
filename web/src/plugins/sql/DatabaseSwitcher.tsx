import React, { useState } from 'react';
import type { SqlPayload } from '@shared/plugins/sql/shared';

// What the `New database…` option carries. An empty value cannot be a database's name — the
// registry's rule wants at least one letter, digit, `-` or `_` — so it can mean "ask for one" without
// a sentinel that could collide with one.
const NAMING = '';

// The header's database switcher: every database the registry knows, and a way to name one it does
// not. A list of names that exist is no way to make the first one, and the field beside it is the
// control the spec promises. The name is sent as typed, because the server already answers an invalid
// one with the refusal that says which characters it wants, which is more use than a field that
// refuses to be typed into.
export function DatabaseSwitcher({ payload, onOpen }: {
  payload: SqlPayload;
  onOpen(name: string): void;
}) {
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  const create = () => {
    const wanted = name.trim();
    if (wanted === '') return;
    setNaming(false);
    setName('');
    onOpen(wanted);
  };

  if (naming) {
    return (
      <span className="sql-database-new">
        <input
          value={name}
          autoFocus
          aria-label="New database name"
          placeholder="New database name"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') { event.preventDefault(); create(); }
            else if (event.key === 'Escape') { setNaming(false); setName(''); }
          }}
        />
        <button type="button" onClick={create} disabled={name.trim() === ''}>Create</button>
      </span>
    );
  }

  return (
    <select
      className="sql-database"
      value={payload.database}
      onChange={(event) => {
        if (event.target.value === NAMING) { setNaming(true); return; }
        onOpen(event.target.value);
      }}
      aria-label="Database"
    >
      {payload.databases.length === 0 && <option value={payload.database}>{payload.database}</option>}
      {payload.databases.map((entry) => (
        <option key={entry.name} value={entry.name}>
          {entry.name}{entry.open ? ' •' : ''}
        </option>
      ))}
      <option value={NAMING}>New database…</option>
    </select>
  );
}
