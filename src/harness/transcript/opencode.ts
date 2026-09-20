import { homedir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeOpencodePart } from './normalize.js';
import { withSource } from './render.js';
import { asRecord, asString, asNumber } from './json.js';
import type { TranscriptSource } from './source.js';

// opencode keeps its sessions in a SQLite database rather than in per-session files (the JSON files
// its `storage/` directory once held are gone in the current version), so this adapter is a database
// reader. A subagent is an ordinary `session` row whose `parent_id` points at the tailed session.
//
// Three failure modes share one mechanism: reads against a database another process is writing can
// return a transient busy/locked error, and opencode's schema has already changed twice under this
// feature — message and part content moved from flat columns (`role`, `type`, `text`, `tool`,
// `state`) into one JSON document per row in a `data` column. The adapter probes for that column
// once per opened database and reads both layouts; any other query failure means "nothing new" — a
// lock clears on the next poll, and an unrecognized schema simply never resolves, which routes the
// tab into the ordinary fallback plus one notification instead of breaking it.
export class OpencodeTranscriptSource implements TranscriptSource {
  private database: DatabaseSync | undefined;
  private databaseProbed = false;
  private dataColumns = { message: false, part: false };
  private sessions: string[] = [];
  private position = { time: 0, id: '' };

  constructor(private cwd: string, private spawnedAt: number, private home: string = homedir()) {}

  resolved(): boolean {
    return this.sessions.length > 0;
  }

  poll(): string[] {
    try {
      const database = this.open();
      if (!database) return [];
      this.detectDataColumns(database);
      if (this.sessions.length === 0) this.resolve(database);
      if (this.sessions.length === 0) return [];
      this.discoverChildren(database);
      return this.readMessages(database);
    } catch {
      return [];
    }
  }

  private open(): DatabaseSync | undefined {
    if (this.database) return this.database;
    try {
      this.database = new DatabaseSync(path.join(this.home, '.local', 'share', 'opencode', 'opencode.db'), { readOnly: true });
    } catch {
      return undefined;
    }
    return this.database;
  }

  // Message and part content live in a `data` JSON document on the current opencode and in flat
  // columns on older ones. The probe runs once per opened database; a table missing entirely
  // probes as flat, and the queries that follow throw into the shared catch.
  private detectDataColumns(database: DatabaseSync): void {
    if (this.databaseProbed) return;
    this.databaseProbed = true;
    this.dataColumns = {
      message: hasColumn(database, 'message', 'data'),
      part: hasColumn(database, 'part', 'data'),
    };
  }

  // The tab's session is the newest top-level one started in its cwd after the PTY spawned. A
  // subagent session carries the same directory and a later timestamp, so parented rows are excluded
  // here — they are picked up as children of the resolved session instead.
  private resolve(database: DatabaseSync): void {
    const rows = query(
      database,
      `SELECT id, time_created FROM session
       WHERE directory = ? AND time_created >= ? AND (parent_id IS NULL OR parent_id = '')
       ORDER BY time_created DESC, id DESC LIMIT 1`,
      [this.cwd, this.spawnedAt],
    );
    const id = asString(rows[0]?.id);
    if (id) this.sessions = [id];
  }

  // Subagent sessions appear over the parent's life, so the child set is re-read on every poll.
  private discoverChildren(database: DatabaseSync): void {
    const rows = query(
      database,
      `SELECT id FROM session WHERE parent_id IN (${placeholders(this.sessions.length)})`,
      this.sessions,
    );
    for (const row of rows) {
      const id = asString(row.id);
      if (id && !this.sessions.includes(id)) this.sessions.push(id);
    }
  }

  // Messages after the private `(time_created, id)` position, each rendered from its `part` rows.
  // Rows belonging to a child session carry that session's identity as their source label. The
  // role comes from the `data` document on the current schema and from its own column before it.
  private readMessages(database: DatabaseSync): string[] {
    const columns = this.dataColumns.message ? 'id, session_id, time_created, data' : 'id, role, session_id, time_created';
    const rows = query(
      database,
      `SELECT ${columns} FROM message
       WHERE session_id IN (${placeholders(this.sessions.length)})
         AND (time_created > ? OR (time_created = ? AND id > ?))
       ORDER BY time_created, id`,
      [...this.sessions, this.position.time, this.position.time, this.position.id],
    );
    const blocks: string[] = [];
    for (const row of rows) {
      const id = asString(row.id) ?? '';
      this.position = { time: asNumber(row.time_created) ?? this.position.time, id };
      const role = asString(this.dataColumns.message ? jsonRecord(row.data)?.role : row.role) ?? 'assistant';
      const label = asString(row.session_id) === this.sessions[0] ? undefined : `subagent ${asString(row.session_id) ?? ''}`;
      blocks.push(...this.readParts(database, id, role, label));
    }
    return blocks;
  }

  private readParts(database: DatabaseSync, messageId: string, role: string, label: string | undefined): string[] {
    const blocks: string[] = [];
    const parts = this.dataColumns.part
      ? query(database, 'SELECT data FROM part WHERE message_id = ? ORDER BY id', [messageId])
        .flatMap((row) => {
          const record = jsonRecord(row.data);
          return record ? [record] : [];
        })
      : query(database, 'SELECT type, text, tool, state FROM part WHERE message_id = ? ORDER BY id', [messageId]);
    for (const row of parts) {
      const rendered = normalizeOpencodePart(this.dataColumns.part ? row : partRecord(row), role);
      if (rendered) blocks.push(withSource(label, rendered));
    }
    return blocks;
  }
}

// A part's `state` is stored as a JSON string; the normalizer wants it as the object it describes.
function partRecord(row: Record<string, unknown>): Record<string, unknown> {
  const state = asString(row.state);
  if (state === undefined) return row;
  try {
    return { ...row, state: asRecord(JSON.parse(state)) };
  } catch {
    return row;
  }
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => '?').join(', ');
}

function hasColumn(database: DatabaseSync, table: string, column: string): boolean {
  const rows = query(database, `PRAGMA table_info(${table})`, []);
  return rows.some((row) => asString(row.name) === column);
}

// A `data` column's JSON document, or undefined when it does not parse — a value opencode wrote
// that this adapter cannot read is skipped, never thrown.
function jsonRecord(value: unknown): Record<string, unknown> | undefined {
  const text = asString(value);
  if (text === undefined) return asRecord(value);
  try {
    return asRecord(JSON.parse(text));
  } catch {
    return undefined;
  }
}

function query(database: DatabaseSync, sql: string, parameters: (string | number)[]): Record<string, unknown>[] {
  return database.prepare(sql).all(...parameters);
}
