import type { DatabaseSync } from 'node:sqlite';
import type { DatabaseCellView, DatabaseGridView, DatabaseRowView } from '../protocol.js';
import { coerce } from './row-keys.js';

// A statement the user typed into the console, turned into a grid page.
//
// `src/database/export.ts` streams its rows for the same reason this module does, and says so there.

/** How many rows a statement the user typed may bring across. */
export const CONSOLE_ROW_LIMIT = 200;

function toCell(value: unknown): DatabaseCellView {
  const isNull = value === null || value === undefined;
  return { text: isNull ? '' : String(coerce(value)), isNull };
}

/** Take at most `CONSOLE_ROW_LIMIT` rows from an iterator, and say whether it had more. */
function takeRows(rows: Iterable<Record<string, unknown>>): { taken: Record<string, unknown>[]; truncated: boolean } {
  const taken: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (taken.length === CONSOLE_ROW_LIMIT) return { taken, truncated: true };
    taken.push(row);
  }
  return { taken, truncated: false };
}

/**
 * Run one read the user typed and answer with a page of it.
 *
 * The column names come from the statement rather than from row 0, so an empty result still renders
 * a header. `truncated` makes the totals report the ceiling rather than claiming a result of exactly
 * that size, which is the difference between a table that is short and a query that was cut off.
 */
function consoleGrid(
  sql: string,
  rows: Record<string, unknown>[],
  names: string[],
  truncated: boolean,
): DatabaseGridView {
  const page: DatabaseRowView[] = rows.map((row) => ({
    key: '',
    cells: names.map((name) => toCell(row[name])),
  }));
  const total = truncated ? CONSOLE_ROW_LIMIT : rows.length;
  return {
    sql,
    parameters: [],
    columns: names,
    rows: page,
    total,
    unfilteredTotal: total,
    offset: 0,
    limit: CONSOLE_ROW_LIMIT,
    order: [],
  };
}

/** Prepare, stream, and cap one read. A row carries no key: a console result is not a page to edit. */
export function readStatement(database: DatabaseSync, sql: string): DatabaseGridView {
  const statement = database.prepare(sql);
  const names = statement.columns().map((column) => column.name);
  const { taken, truncated } = takeRows(statement.iterate() as Iterable<Record<string, unknown>>);
  return consoleGrid(sql, taken, names, truncated);
}
