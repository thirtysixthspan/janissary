import { closeSync, existsSync, mkdirSync, openSync, statSync, writeSync } from 'node:fs';
import path from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import type { DatabaseColumnView, DatabaseGridQuery } from '../protocol.js';
import { selectStatement } from './grid-sql.js';
import { coerce } from './row-keys.js';
import { humanSize } from '../openers/size.js';
import { errorText } from '../error-text.js';
import { dbExportDir } from '../connections.js';

// Writes the export. It runs the grid's own filters and order with the limit removed, because an
// export of a filtered view that silently stopped at the page would be worse than no export — and it
// streams the rows through `iterate()` rather than materializing them, which is the one place in this
// feature where an unbounded result set would otherwise land in the server's memory at once.
//
// The writes are synchronous on purpose. A stream would return before the file was flushed, and the
// caller needs the byte count to report a size and needs the file to exist before it hands the path
// to the `/open/` allow-list. The cost is a blocked event loop for the duration, which is exactly
// what `EXPORT_ROW_LIMIT` bounds.

export const EXPORT_ROW_LIMIT = 1_000_000;

export type ExportOutcome =
  | { ok: true; path: string; name: string; size: string; rows: number }
  | { ok: false; error: string };

// The same shape as `nextNumberedSibling` (`src/openers/numbered-sibling.ts`) — always numbered,
// `-n` before the extension, first free wins — but not that function, which appends `.png` to every
// name it builds and is about a captured frame beside a video.
function nextExportName(dir: string, base: string, extension: string): string {
  for (let n = 1; ; n++) {
    const candidate = `${base}-${n}.${extension}`;
    if (!existsSync(path.join(dir, candidate))) return candidate;
  }
}

// RFC 4180's minimum: a field is quoted when it holds a comma, a quote, or a line break, and an
// interior quote is doubled.
export function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function csvRow(values: readonly (string | number)[]): string {
  return `${values.map((value) => csvField(String(value))).join(',')}\r\n`;
}

/** Beside the project's databases, so an export is where a user would look for one. */
export function exportDir(): string {
  return dbExportDir();
}

function writeRows(
  database: DatabaseSync,
  sql: string,
  parameters: (string | number)[],
  names: string[],
  file: string,
  format: 'csv' | 'json',
): number {
  const handle = openSync(file, 'w');
  let written = 0;
  try {
    if (format === 'csv') writeSync(handle, csvRow(names));
    else writeSync(handle, '[');
    const rows = database.prepare(sql).iterate(...parameters) as Iterable<Record<string, unknown>>;
    for (const row of rows) {
      const values = names.map((name) => coerce(row[name]));
      if (format === 'csv') writeSync(handle, csvRow(values));
      else {
        const record: Record<string, string | number> = {};
        for (const [i, name] of names.entries()) { record[name] = values[i] ?? ''; }
        writeSync(handle, `${written ? ',' : ''}${JSON.stringify(record)}`);
      }
      written += 1;
    }
    if (format !== 'csv') writeSync(handle, ']');
  } finally {
    closeSync(handle);
  }
  return written;
}

export function exportRows(
  database: DatabaseSync,
  databaseName: string,
  query: DatabaseGridQuery,
  columns: DatabaseColumnView[],
  format: 'csv' | 'json',
  total: number,
): ExportOutcome {
  const names = columns.map((column) => column.name);
  if (names.length === 0) return { ok: false, error: `"${query.object}" has no columns.` };
  if (total > EXPORT_ROW_LIMIT) {
    return {
      ok: false,
      error: `Export too large: ${total.toLocaleString('en-US')} rows (limit ${EXPORT_ROW_LIMIT.toLocaleString('en-US')}). Add a filter and try again.`,
    };
  }
  const statement = selectStatement({ ...query, limit: total || 1, offset: 0 }, columns);
  const dir = exportDir();
  try {
    mkdirSync(dir, { recursive: true });
    const name = nextExportName(dir, `${databaseName}-${query.object}`, format);
    const file = path.join(dir, name);
    const written = writeRows(database, statement.sql, statement.parameters, names, file, format);
    return { ok: true, path: file, name, size: humanSize(statSync(file).size), rows: written };
  } catch (error) {
    return { ok: false, error: errorText(error) };
  }
}
