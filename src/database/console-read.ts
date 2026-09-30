import type { DatabaseSync } from 'node:sqlite';
import type { DatabaseCellView, DatabaseGridView, DatabaseRowView, DatabaseStatementReport } from '../protocol.js';
import { RESULT_ROW_LIMIT, type OpenResult, type ResultWriter } from './export.js';
import { coerce } from './row-keys.js';

// A statement the user typed into the console, turned into a grid page and a report of what it
// produced.
//
// `src/database/export.ts` streams its rows for the same reason this module does, and says so there.
//
// The report exists because the grid is not the whole of a result. The console caps a grid at
// `CONSOLE_ROW_LIMIT` rows and says so on the range line, but a notification has to hold the result in
// a line of text, and a result of ten thousand rows would be neither readable nor bounded. So the
// first `REPORT_LINE_BUDGET` lines are what the line carries, and once there are more than that the
// rest goes to a file the line links to — the arrangement an auto-approved permission prompt already
// uses for its screen capture.
//
// One pass, and the statement is never run twice. The rendered lines are buffered only while the
// result could still turn out to be short; the row that makes it long is what opens the file, and
// everything after it streams straight in. A result that fits never touches the disk.

/** How many rows a statement the user typed may bring across. */
export const CONSOLE_ROW_LIMIT = 200;

/** How many lines of a result a notification carries before the rest goes to a file. */
export const REPORT_LINE_BUDGET = 40;

function toCell(value: unknown): DatabaseCellView {
  const isNull = value === null || value === undefined;
  return { text: isNull ? '' : String(coerce(value)), isNull };
}

/** One row as the report renders it: tab-separated, so a spreadsheet and an editor both read it. */
function reportLine(names: readonly string[], row: Record<string, unknown>): string {
  return names.map((name) => toCell(row[name]).text).join('\t');
}

/**
 * The walk that produces both answers at once.
 *
 * `grid` takes the first `CONSOLE_ROW_LIMIT` rows and stops there; `report` keeps the first
 * `REPORT_LINE_BUDGET` lines in memory and the rest on disk. The two caps answer separate questions —
 * a grid a person reads, and a result somebody wants in full — and a result can be long long before
 * it is too long for a table, and too long for a table while still being short enough to say.
 */
function take(
  rows: Iterable<Record<string, unknown>>,
  names: string[],
  openResult?: OpenResult,
) {
  const taken: Record<string, unknown>[] = [];
  const lines: string[] = [];
  let file: ResultWriter | undefined;
  let count = 0;
  let capped = false;
  let shortened = false;
  for (const row of rows) {
    count += 1;
    if (taken.length < CONSOLE_ROW_LIMIT) taken.push(row);
    if (file) {
      if (count > RESULT_ROW_LIMIT) { capped = true; break; }
      file.write(`${reportLine(names, row)}\n`);
      continue;
    }
    if (lines.length < REPORT_LINE_BUDGET) { lines.push(reportLine(names, row)); continue; }
    // The row that makes the result long: everything buffered so far goes out first, and from here on
    // the file takes a row at a time. This is the only place a result file is opened, which is what
    // makes a short result leave nothing on disk. A host with nowhere to put one keeps the buffered
    // lines and drops the rest, so the line is still the same shortened result without its link.
    shortened = true;
    file = openResult?.();
    if (!file) continue;
    file.write(`${lines.join('\n')}\n${reportLine(names, row)}\n`);
  }
  return { taken, lines, file, count, capped, shortened };
}

/**
 * Run one read the user typed and answer with a page of it and a report of the whole of it.
 *
 * The column names come from the statement rather than from row 0, so an empty result still renders
 * a header. `truncated` makes the totals report the ceiling rather than claiming a result of exactly
 * that size, which is the difference between a table that is short and a query that was cut off, and
 * `keyless` carries the same idea about identity: a statement is not necessarily about one object, so
 * there is no row here for a write to address.
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
    truncated,
    keyless: true,
  };
}

/** What the line says: the result, or as much of it as a line can hold. */
function reportText(
  names: string[],
  lines: readonly string[],
  count: number,
  shortened: boolean,
  capped: boolean,
): string {
  if (count === 0) return '(no rows)';
  const total = count.toLocaleString('en-US');
  const tail = capped
    ? `(${total} rows read, ${RESULT_ROW_LIMIT.toLocaleString('en-US')} written to the file)`
    : shortened
      ? `(${total} rows — first ${lines.length} shown)`
      : `(${count} row${count === 1 ? '' : 's'})`;
  return [names.join('\t'), ...lines, tail].join('\n');
}

/**
 * Prepare, stream, and cap one read. A row carries no key: a console result is not a page to edit.
 *
 * `openResult` is what turns a long result into a file, and it is called only once the result has
 * proved long — a short one leaves no file behind. A host with nowhere to put a file gets the
 * shortened result on its own, which is the same line minus the link.
 */
export function readStatement(
  database: DatabaseSync,
  sql: string,
  openResult?: OpenResult,
): { grid: DatabaseGridView; report: DatabaseStatementReport } {
  const statement = database.prepare(sql);
  const names = statement.columns().map((column) => column.name);
  const { taken, lines, file, count, capped, shortened } = take(
    statement.iterate() as Iterable<Record<string, unknown>>, names, openResult,
  );
  const report: DatabaseStatementReport = { text: reportText(names, lines, count, shortened, capped) };
  if (file) {
    file.end(`(${count.toLocaleString('en-US')} rows${capped ? `, capped at ${RESULT_ROW_LIMIT.toLocaleString('en-US')}` : ''})\n`);
    report.file = file.path;
  }
  return { grid: consoleGrid(sql, taken, names, count > CONSOLE_ROW_LIMIT || capped), report };
}
