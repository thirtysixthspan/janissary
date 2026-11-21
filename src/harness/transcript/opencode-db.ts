import type { DatabaseSync } from 'node:sqlite';
import { asRecord, asString } from './json.js';

export function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

export function query(database: DatabaseSync, sql: string, parameters: (string | number)[]): Record<string, unknown>[] {
  return database.prepare(sql).all(...parameters);
}

const MAX_DISCOVERY_DEPTH = 16;
const MAX_DISCOVERED_SESSIONS = 128;

// A subagent can itself dispatch a subagent, so walk the parent chain a level at a time. The seen
// check ends a malformed parent_id cycle, and the two caps stop a deep or wide tree from growing the
// session list (and the IN list) without limit on one poll.
export function discoverDescendants(database: DatabaseSync, table: 'session' | 'session_v2', sessions: string[]): void {
  let frontier = [...sessions];
  for (let depth = 0; depth < MAX_DISCOVERY_DEPTH && frontier.length > 0; depth += 1) {
    const rows = query(
      database,
      `SELECT id FROM ${table} WHERE parent_id IN (${placeholders(frontier.length)})`,
      frontier,
    );
    const next: string[] = [];
    for (const row of rows) {
      const id = asString(row.id);
      if (!id || sessions.includes(id)) continue;
      if (sessions.length >= MAX_DISCOVERED_SESSIONS) return;
      sessions.push(id);
      next.push(id);
    }
    frontier = next;
  }
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
