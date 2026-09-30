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
// `CONSOLE_ROW_LIMIT` rows and says so on the range line, and a notification is a one-line event, not
// a table. So the result goes to a file — the column names, every row, and the count — and the
// notification says in a few words how many rows came back and links it, which is the arrangement an
// auto-approved permission prompt already uses for its screen capture.
//
// One pass, and the statement is never run twice: the file is opened before the walk and every row
// streams straight into it. Only a host with nowhere to put a file buffers anything, and then only the
// first `REPORT_LINE_BUDGET` lines, which are what the line carries in its place.

/** How many rows a statement the user typed may bring across. */
export const CONSOLE_ROW_LIMIT = 200;

/** How many lines of a result a notification carries when there was nowhere to write the file. */
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
 * `grid` takes the first `CONSOLE_ROW_LIMIT` rows and stops there; the file takes every row up to
 * `RESULT_ROW_LIMIT`, starting with the column names. The two caps answer separate questions — a grid
 * a person reads, and a result somebody wants in full. With no file, the first `REPORT_LINE_BUDGET`
 * lines are kept for the line to carry instead, and the rest are only counted.
 */
function take(
  rows: Iterable<Record<string, unknown>>,
  names: string[],
  openResult?: OpenResult,
) {
  const taken: Record<string, unknown>[] = [];
  const lines: string[] = [];
  const file: ResultWriter | undefined = openResult?.();
  let count = 0;
  let capped = false;
  try {
    file?.write(`${names.join('\t')}\n`);
    for (const row of rows) {
      count += 1;
      if (taken.length < CONSOLE_ROW_LIMIT) taken.push(row);
      if (file) {
        if (count > RESULT_ROW_LIMIT) { capped = true; break; }
        file.write(`${reportLine(names, row)}\n`);
      } else if (lines.length < REPORT_LINE_BUDGET) {
        lines.push(reportLine(names, row));
      }
    }
  } catch (error) {
    // A statement can fail part-way through its rows, and a write can fail too. The file is opened
    // before the walk, so it is closed here rather than left open for every walk that fails.
    file?.end('');
    throw error;
  }
  return { taken, lines, file, count, capped };
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

/** `1 row`, `12 rows`, `1,000,000 rows`. */
function rowCount(count: number): string {
  return `${count.toLocaleString('en-US')} row${count === 1 ? '' : 's'}`;
}

/** What the line says when the result is in a file: how many rows came back, in one line. */
function summaryText(count: number, capped: boolean): string {
  const limit = RESULT_ROW_LIMIT.toLocaleString('en-US');
  if (capped) return `Query returned more than ${limit} rows; the first ${limit} are in the file.`;
  if (count === 0) return 'Query returned no rows.';
  return `Query returned ${rowCount(count)}.`;
}

/** What the line says when there was nowhere to put a file: as much of the result as a line holds. */
function shortenedText(names: string[], lines: readonly string[], count: number): string {
  if (count === 0) return '(no rows)';
  const tail = count > lines.length
    ? `(${count.toLocaleString('en-US')} rows — first ${lines.length} shown)`
    : `(${rowCount(count)})`;
  return [names.join('\t'), ...lines, tail].join('\n');
}

/** The file's last line: the count, and the ceiling when the result ran past it. */
function fileTrailer(count: number, capped: boolean): string {
  if (capped) return `(more than ${RESULT_ROW_LIMIT.toLocaleString('en-US')} rows, capped at ${RESULT_ROW_LIMIT.toLocaleString('en-US')})\n`;
  return count === 0 ? '(no rows)\n' : `(${rowCount(count)})\n`;
}

/**
 * Prepare, stream, and cap one read. A row carries no key: a console result is not a page to edit.
 *
 * `openResult` is what the result is written into, header first. A host with nowhere to put a file
 * gets the shortened result as the line's text instead, so a statement that ran perfectly well never
 * loses what it returned.
 */
export function readStatement(
  database: DatabaseSync,
  sql: string,
  openResult?: OpenResult,
): { grid: DatabaseGridView; report: DatabaseStatementReport } {
  const statement = database.prepare(sql);
  const names = statement.columns().map((column) => column.name);
  const { taken, lines, file, count, capped } = take(
    statement.iterate() as Iterable<Record<string, unknown>>, names, openResult,
  );
  let report: DatabaseStatementReport;
  if (file) {
    file.end(fileTrailer(count, capped));
    report = { text: summaryText(count, capped), file: file.path };
  } else {
    report = { text: shortenedText(names, lines, count) };
  }
  return { grid: consoleGrid(sql, taken, names, count > CONSOLE_ROW_LIMIT || capped), report };
}
