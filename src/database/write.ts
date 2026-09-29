import type { DatabaseSync } from 'node:sqlite';
import type { DatabaseColumnView } from '../protocol.js';
import type { RowKeyStore} from './row-keys.js';
import { targetWhere } from './row-keys.js';
import { primaryKeyColumns, quoteIdentifier } from './schema.js';

// The three mutations. Every one of them takes its object name from the row key it was handed, never
// from the client, and every one of them refuses a table with no primary key before it prepares
// anything — so a write cannot address a row it was not given or a table it cannot address.

export type WriteOutcome =
  | { ok: true; changed: number; sql: string; parameters: (string | number | null)[] }
  | { ok: false; error: string };

const STALE_ROW = 'That row is no longer loaded. Refresh and try again.';
const READ_ONLY = 'This table has no primary key, so its rows cannot be addressed.';

function refuse(error: string): WriteOutcome {
  return { ok: false, error };
}

function done(database: DatabaseSync, sql: string, parameters: (string | number | null)[]): WriteOutcome {
  const result = database.prepare(sql).run(...parameters);
  return { ok: true, changed: Number(result.changes), sql, parameters };
}

export function updateCell(
  keys: RowKeyStore,
  key: string,
  column: string,
  value: string | null,
  columnsOf: (object: string) => DatabaseColumnView[],
  databaseOf: (name: string) => DatabaseSync,
): WriteOutcome {
  const target = keys.resolve(key);
  if (!target) return refuse(STALE_ROW);
  const columns = columnsOf(target.object);
  const keysOf = primaryKeyColumns(columns);
  if (keysOf.length === 0) return refuse(READ_ONLY);
  if (columns.every((entry) => entry.name !== column)) {
    return refuse(`"${target.object}" has no column "${column}".`);
  }
  const where = targetWhere(target, columns);
  const parameters = [value, ...target.values];
  return done(
    databaseOf(target.database),
    `UPDATE ${quoteIdentifier(target.object)} SET ${quoteIdentifier(column)} = ? WHERE ${where}`,
    parameters,
  );
}

export function deleteRow(
  keys: RowKeyStore,
  key: string,
  columnsOf: (object: string) => DatabaseColumnView[],
  databaseOf: (name: string) => DatabaseSync,
): WriteOutcome {
  const target = keys.resolve(key);
  if (!target) return refuse(STALE_ROW);
  const columns = columnsOf(target.object);
  if (primaryKeyColumns(columns).length === 0) return refuse(READ_ONLY);
  return done(
    databaseOf(target.database),
    `DELETE FROM ${quoteIdentifier(target.object)} WHERE ${targetWhere(target, columns)}`,
    target.values,
  );
}

/** The columns the caller named, in the order the schema declares them. */
function insertParts(
  columns: DatabaseColumnView[],
  cells: { column: string; value: string | null }[],
): { names: string; values: (string | null)[] } | { error: string } {
  const named = new Map(cells.map((cell) => [cell.column, cell.value]));
  for (const column of named.keys()) {
    if (columns.every((entry) => entry.name !== column)) {
      return { error: `"${column}" is not a column of this table.` };
    }
  }
  const used = columns.filter((column) => named.has(column.name));
  return {
    names: used.map((column) => quoteIdentifier(column.name)).join(', '),
    values: used.map((column) => named.get(column.name) ?? null),
  };
}

export function insertRow(
  object: string,
  cells: { column: string; value: string | null }[],
  columns: DatabaseColumnView[],
  database: DatabaseSync,
): WriteOutcome {
  if (primaryKeyColumns(columns).length === 0) return refuse(READ_ONLY);
  const parts = insertParts(columns, cells);
  if ('error' in parts) return refuse(parts.error);
  const placeholders = parts.values.map(() => '?').join(', ');
  return done(
    database,
    `INSERT INTO ${quoteIdentifier(object)} (${parts.names}) VALUES (${placeholders})`,
    parts.values,
  );
}
