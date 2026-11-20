import type { DatabaseSync } from 'node:sqlite';
import { asRecord, asString } from './json.js';

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

export function query(database: DatabaseSync, sql: string, parameters: (string | number)[]): Record<string, unknown>[] {
  return database.prepare(sql).all(...parameters);
}

export function hasColumn(database: DatabaseSync, table: string, column: string): boolean {
  const rows = query(database, `PRAGMA table_info(${table})`, []);
  return rows.some((row) => asString(row.name) === column);
}

// A part's `state` is stored as a JSON string on the flat v1 schema; the normalizer wants the object
// it describes.
export function partRecord(row: Record<string, unknown>): Record<string, unknown> {
  const state = asString(row.state);
  if (state === undefined) return row;
  try {
    return { ...row, state: asRecord(JSON.parse(state)) };
  } catch {
    return row;
  }
}

// A `data` column's JSON document, or undefined when it does not parse — a value opencode wrote
// that this adapter cannot read is skipped, never thrown.
export function jsonRecord(value: unknown): Record<string, unknown> | undefined {
  const text = asString(value);
  if (text === undefined) return asRecord(value);
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}
