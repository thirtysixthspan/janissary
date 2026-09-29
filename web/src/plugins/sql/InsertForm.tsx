import React, { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSave } from '@fortawesome/free-solid-svg-icons';
import { insertStatement, type SqlColumn, type SqlInsertCell } from '@shared/plugins/sql/shared';

// The insert form: one input per column, the statement the save will run, and Save.
//
// **Insert row** used to write a row of nulls on the click itself, so a row landed in the database
// before a value was typed and before any statement was shown. A user who pressed it and changed
// their mind had already written a row, and one that survives a `NOT NULL` constraint is an error to
// clean up by hand -- the same press is one stray double-click away on a table the user did not mean
// to be editing. DB Browser for SQLite replaced its immediate-insert path with a dialog for the same
// reason.

// What one cell's input holds. A blank string and an explicit null are different values, so the
// toggle is a separate control rather than a convention about typing nothing -- which is also what
// `CellEditor` already offers, so the two agree about how a null is set.
type Draft = { text: string; isNull: boolean };

function draftFor(value: string | null): Draft {
  return value === null ? { text: '', isNull: true } : { text: value, isNull: false };
}

export function InsertForm({
  object, columns, onSave, onCancel,
}: {
  object: string;
  columns: readonly SqlColumn[];
  onSave(cells: SqlInsertCell[]): void;
  onCancel(): void;
}) {
  // Every column is offered, so the form is a picture of the row rather than a question about which
  // columns to fill in. A column the user leaves alone is still sent as null, which is what the
  // click-to-insert path did and what a database default expects.
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    () => Object.fromEntries(columns.map((column) => [column.name, draftFor(null)])),
  );

  const cells = columns.map((column) => ({
    column: column.name,
    value: drafts[column.name]?.isNull ? null : (drafts[column.name]?.text ?? ''),
  }));

  return (
    <div className="sql-insert">
      <div className="sql-insert-head">
        <strong>New row in {object}</strong>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
      <div className="sql-insert-fields">
        {columns.map((column) => {
          const draft = drafts[column.name] ?? { text: '', isNull: false };
          return (
            <label key={column.name} className="sql-insert-field">
              <span className="sql-insert-name">
                {column.name}
                {column.pk > 0 && <span className="sql-insert-key" title="Primary key"> pk</span>}
              </span>
              <input
                value={draft.text}
                disabled={draft.isNull}
                onChange={(event) => setDrafts({ ...drafts, [column.name]: { text: event.target.value, isNull: false } })}
                aria-label={`New ${column.name}`}
              />
              <label className="sql-insert-null">
                <input
                  type="checkbox"
                  checked={draft.isNull}
                  onChange={(event) => setDrafts({ ...drafts, [column.name]: { text: '', isNull: event.target.checked } })}
                  aria-label={`${column.name} is null`}
                />
                NULL
              </label>
            </label>
          );
        })}
      </div>
      <pre className="sql-insert-statement" data-testid="sql-insert-statement">
        {insertStatement(object, cells, columns)}
      </pre>
      <div className="sql-insert-actions">
        <button type="button" onClick={() => onSave(cells)}>
          <FontAwesomeIcon icon={faSave} /> Save
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
