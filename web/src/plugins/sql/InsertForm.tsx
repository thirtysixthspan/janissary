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

// A column's first state. The primary key starts as an explicit null, because a key the user did not
// choose is the one value a new row almost always has. Every other column starts untouched, which is
// a third state the two fields already spell between them: no text and no null.
function draftFor(column: SqlColumn): Draft {
  return { text: '', isNull: column.pk > 0 };
}

// The two states that put a column in the statement, and the one that leaves it out. A column the
// insert does not name gets the table's own `DEFAULT`, so a schema's defaults run for a row added
// here rather than being overwritten by a null nobody typed.
function isNamed(draft: Draft): boolean {
  return draft.isNull || draft.text !== '';
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
  // columns to fill in. Only the columns the user has given a value or an explicit null are named by
  // the statement; the rest are left to the table's defaults, which is what a column nobody filled in
  // is asking for.
  const [drafts, setDrafts] = useState<Record<string, Draft>>(
    () => Object.fromEntries(columns.map((column) => [column.name, draftFor(column)])),
  );

  const cells = columns.filter((column) => isNamed(drafts[column.name] ?? draftFor(column)))
    .map((column) => ({
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
