import type { DatabaseSync } from 'node:sqlite';
import type {
  DatabaseCellView,
  DatabaseColumnView,
  DatabaseGridQuery,
  DatabaseGridView,
  DatabaseRowView,
} from '../protocol.js';
import { countStatement, resolveOrder, selectStatement } from './grid-sql.js';
import { coerce, type RowKeyStore } from './row-keys.js';
import { primaryKeyColumns, quoteIdentifier } from './schema.js';

// Runs a grid query and mints the row keys its page carries. `DatabaseGridView.sql` is the exact
// statement that ran, with `?` where a value was bound — the browser shows it rather than an inlined
// rendering, because a value containing a quote cannot be shown inside one safely.

function toCell(value: unknown): DatabaseCellView {
  return { text: value === null || value === undefined ? '' : String(coerce(value)), isNull: value === null || value === undefined };
}

function runCount(database: DatabaseSync, sql: string, parameters: (string | number)[]): number {
  const rows = database.prepare(sql).all(...parameters);
  return Number(rows[0]?.n ?? 0);
}

/** Rows matching the filters, and rows in the object regardless of them. */
export function totals(
  database: DatabaseSync,
  query: DatabaseGridQuery,
  columns: readonly DatabaseColumnView[],
  unfiltered?: number,
): { total: number; unfilteredTotal: number } {
  const count = countStatement(query, columns);
  const total = runCount(database, count.sql, count.parameters);
  return { total, unfilteredTotal: unfiltered ?? total };
}

/**
 * How many rows the object holds with no filters at all.
 *
 * `totals` cannot answer this on its own: given a filtered query and no remembered figure, its only
 * option is to report the filtered count as the whole object, which then becomes the "showing N of
 * M" denominator for good. This is the count that is correct by construction, and it is worth one
 * extra statement the first time an object is asked about with filters on.
 */
export function unfilteredTotal(database: DatabaseSync, query: DatabaseGridQuery): number {
  return runCount(database, `SELECT COUNT(*) AS n FROM ${quoteIdentifier(query.object)}`, []);
}

/**
 * One page of `object`. `keys` is the store the writes resolve against; it is handed in rather than
 * created here so a page's keys outlive the call and the caller decides when a page is superseded.
 */
export function runGrid(
  database: DatabaseSync,
  databaseName: string,
  query: DatabaseGridQuery,
  columns: DatabaseColumnView[],
  keys: RowKeyStore,
  unfilteredTotal?: number,
): DatabaseGridView {
  const select = selectStatement(query, columns);
  if (!select.sql) {
    return { sql: '', parameters: [], columns: [], rows: [], total: 0, unfilteredTotal: 0, offset: query.offset, limit: query.limit, order: [] };
  }
  const statement = database.prepare(select.sql);
  const rows = statement.all(...select.parameters);
  // Column names come from the statement rather than from row 0, so an object whose first page is
  // empty still renders its header.
  const names = statement.columns().map((column) => column.name);
  const keyColumns = primaryKeyColumns(columns);
  const writable = keyColumns.length > 0;
  keys.beginPage();
  const page: DatabaseRowView[] = rows.map((row) => ({
    key: writable ? keys.mint(databaseName, query.object, keyColumns, row) : '',
    cells: names.map((name) => toCell(row[name])),
  }));
  return {
    sql: select.sql,
    parameters: select.parameters,
    columns: names,
    rows: page,
    ...totals(database, query, columns, unfilteredTotal),
    offset: query.offset,
    limit: query.limit,
    // The order actually used, which is not always the order that was asked for.
    order: resolveOrder(query.order, columns),
  };
}
