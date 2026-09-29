import type { DatabaseSync } from 'node:sqlite';
import type { DatabaseColumnStatsView, DatabaseColumnView } from '../protocol.js';
import { quoteIdentifier } from './schema.js';

// Per-column figures for the statistics panel: a few small statements per column, run only when the
// panel is opened. A grid refresh never pays for it, because this is a pass over the whole object
// and a page of rows does not need it.

// A column with more distinct values than this is summarized as a count rather than drawn as bars,
// which keeps the panel readable and the returned value list bounded.
export const DISTINCT_LIMIT = 20;

const NUMERIC_TYPES = new Set(['INTEGER', 'INT', 'REAL', 'NUMERIC', 'DOUBLE', 'FLOAT', 'DOUBLE PRECISION']);

function isNumeric(column: DatabaseColumnView): boolean {
  const type = column.type.trim().toUpperCase();
  return NUMERIC_TYPES.has(type) || /^DECIMAL|NUMERIC/.test(type);
}

function scalar(database: DatabaseSync, sql: string): number {
  const row = database.prepare(sql).get() as Record<string, unknown> | undefined;
  return row ? Number(Object.values(row)[0] ?? 0) : 0;
}

function range(database: DatabaseSync, from: string, column: string): { min?: string; max?: string } {
  const row = database.prepare(`SELECT MIN(${column}) AS lo, MAX(${column}) AS hi FROM ${from}`).get() as
    | Record<string, unknown>
    | undefined;
  const lo = row?.lo;
  const hi = row?.hi;
  return {
    ...(!(lo === null || lo === undefined) && { min: String(lo) }),
    ...(!(hi === null || hi === undefined) && { max: String(hi) }),
  };
}

function distribution(
  database: DatabaseSync,
  from: string,
  column: string,
): { label: string; count: number }[] {
  const rows = database
    .prepare(`SELECT ${column} AS v, COUNT(*) AS n FROM ${from} GROUP BY ${column} ORDER BY n DESC, v`)
    .all() as Record<string, unknown>[];
  return rows.map((row) => ({ label: row.v === null ? 'NULL' : String(row.v), count: Number(row.n) }));
}

export function columnStats(
  database: DatabaseSync,
  object: string,
  column: DatabaseColumnView,
): DatabaseColumnStatsView {
  const from = quoteIdentifier(object);
  const quoted = quoteIdentifier(column.name);
  const total = scalar(database, `SELECT COUNT(*) FROM ${from}`);
  const nulls = scalar(database, `SELECT COUNT(*) FROM ${from} WHERE ${quoted} IS NULL`);
  const distinct = scalar(database, `SELECT COUNT(DISTINCT ${quoted}) FROM ${from}`);
  return {
    name: column.name,
    type: column.type,
    nulls,
    distinct,
    total,
    ...(isNumeric(column) && range(database, from, quoted)),
    values: distinct > 0 && distinct <= DISTINCT_LIMIT ? distribution(database, from, quoted) : [],
  };
}
