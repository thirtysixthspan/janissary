import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { asArray, asNumber, asRecord, asString } from './json.js';
import { hasColumn, jsonRecord, placeholders, query } from './opencode-db.js';
import { normalizeOpencodePart } from './normalize.js';
import { contentText, speech, withSource } from './render.js';
import type { TranscriptSource } from './source.js';

// opencode 2.0 replaced session/message/part with an event-sourced layout: a session owns its turns
// through session_message (one row per turn, the role in `type`, parts inline in `data` or, after a
// later migration, in session_part). This reader mirrors the v1 adapter's polling state machine so
// both produce identical text for the same conversation.
export class OpencodeV2TranscriptSource implements TranscriptSource {
  private database: DatabaseSync | undefined;
  private probed = false;
  private hasParts = false;
  private sessions: string[] = [];
  private position = { time: 0, id: '' };

  constructor(
    private cwd: string,
    private spawnedAt: number,
    private dataHome: string,
  ) {}

  resolved(): boolean {
    return this.sessions.length > 0;
  }

  poll(): string[] {
    try {
      const database = this.open();
      if (!database) return [];
      if (!this.probed) {
        this.probed = true;
        this.hasParts = hasColumn(database, 'session_part', 'message_id');
      }
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

  // The tab's session is the newest top-level one started in its cwd after the PTY spawned. A
  // subagent carries the same directory and a later timestamp, so parented rows are excluded here
  // and picked up as children of the resolved session instead.
  private resolve(database: DatabaseSync): void {
    const rows = query(
      database,
      `SELECT id FROM session_v2
       WHERE directory = ? AND time_created >= ? AND (parent_id IS NULL OR parent_id = '')
       ORDER BY time_created DESC, id DESC LIMIT 1`,
      [this.cwd, this.spawnedAt],
    );
    const id = asString(rows[0]?.id);
    if (id) this.sessions = [id];
  }

  private discoverChildren(database: DatabaseSync): void {
    const rows = query(
      database,
      `SELECT id FROM session_v2 WHERE parent_id IN (${placeholders(this.sessions.length)})`,
      this.sessions,
    );
    for (const row of rows) {
      const id = asString(row.id);
      if (id && !this.sessions.includes(id)) this.sessions.push(id);
    }
  }

  // Turns after the private (time_created, id) position. The role comes from `type`; a child
  // session's rows carry that session's identity as their source label.
  private readMessages(database: DatabaseSync): string[] {
    const rows = query(
      database,
      `SELECT id, session_id, type, time_created, data FROM session_message
       WHERE session_id IN (${placeholders(this.sessions.length)})
         AND (time_created > ? OR (time_created = ? AND id > ?))
       ORDER BY time_created, id`,
      [...this.sessions, this.position.time, this.position.time, this.position.id],
    );
    const blocks: string[] = [];
    for (const row of rows) {
      const id = asString(row.id) ?? '';
      this.position = { time: asNumber(row.time_created) ?? this.position.time, id };
      const type = asString(row.type);
      if (type !== 'user' && type !== 'assistant') continue;
      const sessionId = asString(row.session_id) ?? '';
      const label = sessionId === this.sessions[0] ? undefined : `subagent ${sessionId}`;
      const data = jsonRecord(row.data);
      if (type === 'user') {
        const line = speech('user', asString(data?.text) ?? '');
        if (line) blocks.push(withSource(label, line));
      } else {
        blocks.push(...this.readParts(database, id, data?.content, 'assistant', label));
      }
    }
    return blocks;
  }

  // session_part rows, when present, are the authoritative parts for a turn; older records keep
  // their parts inline in the message's data. Both render through the v1 normalizer's vocabulary.
  private readParts(database: DatabaseSync, messageId: string, inline: unknown, role: string, label: string | undefined): string[] {
    const rows = this.hasParts
      ? query(database, 'SELECT data FROM session_part WHERE message_id = ? ORDER BY ordinal', [messageId])
      : [];
    const parts = rows.length > 0
      ? rows.flatMap((row) => {
        const record = jsonRecord(row.data);
        return record ? [record] : [];
      })
      : asArray(inline);
    const blocks: string[] = [];
    for (const value of parts) {
      const part = asRecord(value);
      if (!part) continue;
      const rendered = normalizeOpencodePart(toV1Part(part), role);
      if (rendered) blocks.push(withSource(label, rendered));
    }
    return blocks;
  }
}

// v2 names a tool under `name` and stores its output in `state.content` as a block list. The v1
// normalizer expects `tool` and a `state.output` string, so adapt that one shape before rendering.
function toV1Part(part: Record<string, unknown>): Record<string, unknown> {
  if (asString(part.type) !== 'tool') return part;
  const state = asRecord(part.state);
  return {
    type: 'tool',
    tool: asString(part.name) ?? 'tool',
    state: { input: state?.input, output: contentText(state?.content) },
  };
}
