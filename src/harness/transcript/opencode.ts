import { homedir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normalizeOpencodePart } from './normalize.js';
import { withSource } from './render.js';
import { asString, asNumber } from './json.js';
import { discoverDescendants, hasColumn, jsonRecord, partRecord, placeholders, query } from './opencode-db.js';
import { OpencodeV2TranscriptSource } from './opencode-v2.js';
import type { TranscriptSource } from './source.js';

// opencode keeps its sessions in a SQLite database rather than in per-session files (the JSON files
// its `storage/` directory once held are gone in the current version), so this adapter is a database
// reader. A subagent is an ordinary session row whose `parent_id` points at the tailed session.
//
// The schema has changed twice under this feature. Content moved from flat columns (`role`, `type`,
// `text`, `tool`, `state`) into a per-row `data` JSON document, and opencode 2.0 moved the tables
// themselves (`session_v2` / `session_message` / `session_part`). This class stays the one public
// source: it detects the 2.0 layout by table presence and hands that case to OpencodeV2TranscriptSource,
// keeping the original reader below for older databases. Reads against a database another process is
// writing can also return a transient busy/locked error; any query failure means "nothing new" — a
// lock clears on the next poll, and an unrecognized schema simply never resolves, which routes the tab
// into the ordinary fallback plus one notification instead of breaking it.
export class OpencodeTranscriptSource implements TranscriptSource {
  private database: DatabaseSync | undefined;
  private databaseProbed = false;
  private dataColumns = { message: false, part: false };
  private sessions: string[] = [];
  private position = { time: 0, id: '' };
  private v2: OpencodeV2TranscriptSource | undefined;
  private layoutChecked = false;

  constructor(
    private cwd: string,
    private spawnedAt: number,
    home: string = homedir(),
    private dataHome: string = path.join(home, '.local', 'share'),
  ) {}

  resolved(): boolean {
    return this.v2 ? this.v2.resolved() : this.sessions.length > 0;
  }

  poll(): string[] {
    try {
      if (!this.layoutChecked) {
        this.layoutChecked = true;
        const database = this.open();
        if (database && hasColumn(database, 'session_v2', 'id')) {
          this.v2 = new OpencodeV2TranscriptSource(this.cwd, this.spawnedAt, this.dataHome);
        }
      }
      if (this.v2) return this.v2.poll();
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
      this.database = new DatabaseSync(path.join(this.dataHome, 'opencode', 'opencode.db'), { readOnly: true });
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

  // Subagent sessions appear over the parent's life, so the descendant set is re-read on every poll.
  private discoverChildren(database: DatabaseSync): void {
    discoverDescendants(database, 'session', this.sessions);
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
