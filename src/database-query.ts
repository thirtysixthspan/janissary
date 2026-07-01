import { type DatabaseSync } from 'node:sqlite';
import {
  databaseFileExists, getConnection, isConnectionOpen,
} from './connections.js';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatRows(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(0 rows)';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => (v === null || v === undefined ? '' : String(v));
  const widths = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r[c]).length)));
  const fmt = (cells: string[]) => cells.map((s, index) => s.padEnd(widths[index])).join('  ');
  const header = fmt(cols);
  const separator = widths.map((w) => '-'.repeat(w)).join('  ');
  const body = rows.map((r) => fmt(cols.map((c) => cell(r[c]))));
  const count = `(${rows.length} row${rows.length === 1 ? '' : 's'})`;
  return [header, separator, ...body, '', count].join('\n');
}

const READ_QUERY = /^\s*(select|pragma|with|explain)\b/i;

export function queryDatabase(name: string, query: string): string {
  if (!databaseFileExists(name) && !isConnectionOpen(name)) {
    return `Database "${name}" does not exist. Create it with: db sqlite create ${name}`;
  }
  let database: DatabaseSync;
  try {
    database = getConnection(name);
  } catch (error) {
    return `Failed to open database "${name}": ${errorMessage(error)}`;
  }
  try {
    if (READ_QUERY.test(query)) {
      const rows = database.prepare(query).all() as Record<string, unknown>[];
      return formatRows(rows);
    }
    database.exec(query);
    return 'OK.';
  } catch (error) {
    return `Query error: ${errorMessage(error)}`;
  }
}
