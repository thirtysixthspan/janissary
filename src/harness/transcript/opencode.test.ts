import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { OpencodeTranscriptSource } from './opencode.js';

let home = '';
const cwd = '/work/project';
const spawnedAt = Date.UTC(2026, 0, 2);

function databaseFile(): string {
  const directory = path.join(home, '.local', 'share', 'opencode');
  mkdirSync(directory, { recursive: true });
  return path.join(directory, 'opencode.db');
}

function openWritable(): DatabaseSync {
  return new DatabaseSync(databaseFile());
}

function createSchema(database: DatabaseSync): void {
  database.exec('CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, time_created INTEGER, parent_id TEXT)');
  database.exec('CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, role TEXT, time_created INTEGER)');
  database.exec('CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, type TEXT, text TEXT, tool TEXT, state TEXT)');
}

function addSession(database: DatabaseSync, id: string, directory: string, timeCreated: number, parentId: string | null): void {
  database.prepare('INSERT INTO session VALUES (?, ?, ?, ?)').run(id, directory, timeCreated, parentId);
}

function addTextMessage(database: DatabaseSync, id: string, sessionId: string, role: string, timeCreated: number, text: string): void {
  database.prepare('INSERT INTO message VALUES (?, ?, ?, ?)').run(id, sessionId, role, timeCreated);
  database.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)').run(`${id}-p1`, id, 'text', text, null, null);
}

beforeEach(() => {
  mkdirSync('temp', { recursive: true });
  home = mkdtempSync(path.join(process.cwd(), 'temp', 'janus-opencode-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('OpencodeTranscriptSource', () => {
  it('honors an injected home over a competing ambient data home', () => {
    const database = openWritable();
    createSchema(database);
    addSession(database, 'mine', cwd, spawnedAt, null);
    addTextMessage(database, 'm1', 'mine', 'user', spawnedAt + 1, 'injected home');
    database.close();
    const ambient = path.join(home, 'ambient');
    mkdirSync(path.join(ambient, 'opencode'), { recursive: true });
    const other = new DatabaseSync(path.join(ambient, 'opencode', 'opencode.db'));
    createSchema(other);
    addSession(other, 'other', cwd, spawnedAt, null);
    addTextMessage(other, 'm2', 'other', 'user', spawnedAt + 1, 'ambient home');
    other.close();
    vi.stubEnv('XDG_DATA_HOME', ambient);
    try {
      expect(new OpencodeTranscriptSource(cwd, spawnedAt, home).poll()).toEqual(['user: injected home']);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('reports nothing and stays unresolved when the database does not exist', () => {
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual([]);
    expect(source.resolved()).toBe(false);
  });

  it('resolves the session by directory and spawn time, skipping earlier and foreign sessions', () => {
    const database = openWritable();
    createSchema(database);
    addSession(database, 'old', cwd, spawnedAt - 1000, null);
    addSession(database, 'other', '/elsewhere', spawnedAt + 1000, null);
    addSession(database, 'mine', cwd, spawnedAt + 1000, null);
    addTextMessage(database, 'm-old', 'old', 'user', spawnedAt - 900, 'previous session');
    addTextMessage(database, 'm-other', 'other', 'user', spawnedAt + 1100, 'other directory');
    addTextMessage(database, 'm1', 'mine', 'user', spawnedAt + 1100, 'this session');
    database.close();

    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: this session']);
    expect(source.resolved()).toBe(true);
  });

  it('returns only newer rows on a second read, in (time_created, id) order', () => {
    const database = openWritable();
    createSchema(database);
    addSession(database, 'mine', cwd, spawnedAt, null);
    addTextMessage(database, 'm1', 'mine', 'user', spawnedAt + 10, 'first');
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: first']);
    expect(source.poll()).toEqual([]);
    addTextMessage(database, 'm2', 'mine', 'assistant', spawnedAt + 20, 'second');
    addTextMessage(database, 'm3', 'mine', 'assistant', spawnedAt + 30, 'third');
    database.close();
    expect(source.poll()).toEqual(['assistant: second', 'assistant: third']);
  });

  it('includes a child session\'s rows, labeled as a subagent', () => {
    const database = openWritable();
    createSchema(database);
    addSession(database, 'mine', cwd, spawnedAt, null);
    addSession(database, 'child', cwd, spawnedAt + 5, 'mine');
    addTextMessage(database, 'm1', 'child', 'assistant', spawnedAt + 10, 'subagent working');
    database.close();
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['[subagent child] assistant: subagent working']);
  });

  it('includes grandchild turns through a nested subagent chain', () => {
    const database = openWritable();
    createSchema(database);
    addSession(database, 'mine', cwd, spawnedAt, null);
    addSession(database, 'child', cwd, spawnedAt + 1, 'mine');
    addSession(database, 'grandchild', cwd, spawnedAt + 2, 'child');
    addTextMessage(database, 'm0', 'mine', 'user', spawnedAt + 3, 'root turn');
    addTextMessage(database, 'm1', 'child', 'assistant', spawnedAt + 4, 'child turn');
    addTextMessage(database, 'm2', 'grandchild', 'assistant', spawnedAt + 5, 'grandchild turn');
    database.close();
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual([
      'user: root turn',
      '[subagent child] assistant: child turn',
      '[subagent grandchild] assistant: grandchild turn',
    ]);
  });

  it('terminates when the session table contains a parent_id cycle', () => {
    const database = openWritable();
    createSchema(database);
    addSession(database, 'mine', cwd, spawnedAt, null);
    addSession(database, 'child', cwd, spawnedAt + 1, 'mine');
    addSession(database, 'grandchild', cwd, spawnedAt + 2, 'child');
    addSession(database, 'loop-a', cwd, spawnedAt + 3, 'grandchild');
    addSession(database, 'loop-b', cwd, spawnedAt + 4, 'loop-a');
    addSession(database, 'self', cwd, spawnedAt + 5, 'self');
    addTextMessage(database, 'm0', 'mine', 'user', spawnedAt + 6, 'root turn');
    addTextMessage(database, 'm1', 'child', 'assistant', spawnedAt + 7, 'child turn');
    addTextMessage(database, 'm2', 'grandchild', 'assistant', spawnedAt + 8, 'grandchild turn');
    database.close();
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual([
      'user: root turn',
      '[subagent child] assistant: child turn',
      '[subagent grandchild] assistant: grandchild turn',
    ]);
  });

  it('renders a tool part from its JSON state column', () => {
    const database = openWritable();
    createSchema(database);
    addSession(database, 'mine', cwd, spawnedAt, null);
    database.prepare('INSERT INTO message VALUES (?, ?, ?, ?)').run('m1', 'mine', 'assistant', spawnedAt + 10);
    database.prepare('INSERT INTO part VALUES (?, ?, ?, ?, ?, ?)')
      .run('m1-p1', 'm1', 'tool', null, 'bash', JSON.stringify({ input: { command: 'ls' }, output: 'a.ts' }));
    database.close();
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['assistant → bash({"command":"ls"})\nbash result: a.ts']);
  });

  it('yields nothing rather than throwing when the schema is not the expected one', () => {
    const database = openWritable();
    database.exec('CREATE TABLE unrelated (id TEXT PRIMARY KEY)');
    database.close();
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(() => source.poll()).not.toThrow();
    expect(source.poll()).toEqual([]);
    expect(source.resolved()).toBe(false);
  });
});

// The current opencode keeps each message's and each part's content as one JSON document in a
// `data` column; the older flat `role`/`type`/`text`/`tool`/`state` columns are gone. The fixture
// below mirrors that shape.
describe('OpencodeTranscriptSource with data-column schema', () => {
  function createDataSchema(database: DatabaseSync): void {
    database.exec('CREATE TABLE session (id TEXT PRIMARY KEY, directory TEXT, parent_id TEXT, time_created INTEGER)');
    database.exec('CREATE TABLE message (id TEXT PRIMARY KEY, session_id TEXT, time_created INTEGER, data TEXT)');
    database.exec('CREATE TABLE part (id TEXT PRIMARY KEY, message_id TEXT, session_id TEXT, time_created INTEGER, data TEXT)');
  }

  function addJsonSession(database: DatabaseSync, id: string, directory: string, timeCreated: number, parentId: string | null): void {
    database.prepare('INSERT INTO session (id, directory, parent_id, time_created) VALUES (?, ?, ?, ?)')
      .run(id, directory, parentId, timeCreated);
  }

  function addJsonMessage(database: DatabaseSync, id: string, sessionId: string, timeCreated: number, role: string, parts: Record<string, unknown>[]): void {
    database.prepare('INSERT INTO message (id, session_id, time_created, data) VALUES (?, ?, ?, ?)')
      .run(id, sessionId, timeCreated, JSON.stringify({ role }));
    for (const [index, part] of parts.entries()) {
      database.prepare('INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)')
        .run(`${id}-p${index}`, id, sessionId, timeCreated, JSON.stringify(part));
    }
  }

  it('resolves the session and reads messages whose role lives in the data JSON', () => {
    const database = openWritable();
    createDataSchema(database);
    addJsonSession(database, 'mine', cwd, spawnedAt, null);
    addJsonMessage(database, 'm1', 'mine', spawnedAt + 10, 'user', [{ type: 'text', text: 'this session' }]);
    database.close();

    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: this session']);
    expect(source.resolved()).toBe(true);
  });

  it('renders a tool part whose state is a nested JSON object', () => {
    const database = openWritable();
    createDataSchema(database);
    addJsonSession(database, 'mine', cwd, spawnedAt, null);
    addJsonMessage(database, 'm1', 'mine', spawnedAt + 10, 'assistant', [
      { type: 'tool', tool: 'bash', state: { input: { command: 'ls' }, output: 'a.ts' } },
    ]);
    database.close();

    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['assistant → bash({"command":"ls"})\nbash result: a.ts']);
  });

  it('includes a child session\'s data-column rows, labeled as a subagent', () => {
    const database = openWritable();
    createDataSchema(database);
    addJsonSession(database, 'mine', cwd, spawnedAt, null);
    addJsonSession(database, 'child', cwd, spawnedAt + 5, 'mine');
    addJsonMessage(database, 'm1', 'child', spawnedAt + 10, 'assistant', [{ type: 'text', text: 'subagent working' }]);
    database.close();

    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['[subagent child] assistant: subagent working']);
  });

  it('includes grandchild turns through a nested subagent chain in the data-column schema', () => {
    const database = openWritable();
    createDataSchema(database);
    addJsonSession(database, 'mine', cwd, spawnedAt, null);
    addJsonSession(database, 'child', cwd, spawnedAt + 1, 'mine');
    addJsonSession(database, 'grandchild', cwd, spawnedAt + 2, 'child');
    addJsonMessage(database, 'm0', 'mine', spawnedAt + 3, 'user', [{ type: 'text', text: 'root turn' }]);
    addJsonMessage(database, 'm1', 'child', spawnedAt + 4, 'assistant', [{ type: 'text', text: 'child turn' }]);
    addJsonMessage(database, 'm2', 'grandchild', spawnedAt + 5, 'assistant', [{ type: 'text', text: 'grandchild turn' }]);
    database.close();
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual([
      'user: root turn',
      '[subagent child] assistant: child turn',
      '[subagent grandchild] assistant: grandchild turn',
    ]);
  });

  it('terminates when the data-column session table contains a parent_id cycle', () => {
    const database = openWritable();
    createDataSchema(database);
    addJsonSession(database, 'mine', cwd, spawnedAt, null);
    addJsonSession(database, 'child', cwd, spawnedAt + 1, 'mine');
    addJsonSession(database, 'grandchild', cwd, spawnedAt + 2, 'child');
    addJsonSession(database, 'loop-a', cwd, spawnedAt + 3, 'grandchild');
    addJsonSession(database, 'loop-b', cwd, spawnedAt + 4, 'loop-a');
    addJsonSession(database, 'self', cwd, spawnedAt + 5, 'self');
    addJsonMessage(database, 'm0', 'mine', spawnedAt + 6, 'user', [{ type: 'text', text: 'root turn' }]);
    addJsonMessage(database, 'm1', 'child', spawnedAt + 7, 'assistant', [{ type: 'text', text: 'child turn' }]);
    addJsonMessage(database, 'm2', 'grandchild', spawnedAt + 8, 'assistant', [{ type: 'text', text: 'grandchild turn' }]);
    database.close();
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual([
      'user: root turn',
      '[subagent child] assistant: child turn',
      '[subagent grandchild] assistant: grandchild turn',
    ]);
  });

  it('returns only newer rows on a second read', () => {
    const database = openWritable();
    createDataSchema(database);
    addJsonSession(database, 'mine', cwd, spawnedAt, null);
    addJsonMessage(database, 'm1', 'mine', spawnedAt + 10, 'user', [{ type: 'text', text: 'first' }]);
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: first']);
    expect(source.poll()).toEqual([]);
    addJsonMessage(database, 'm2', 'mine', spawnedAt + 20, 'assistant', [{ type: 'text', text: 'second' }]);
    database.close();
    expect(source.poll()).toEqual(['assistant: second']);
  });

  it('skips a part whose data column does not parse', () => {
    const database = openWritable();
    createDataSchema(database);
    addJsonSession(database, 'mine', cwd, spawnedAt, null);
    addJsonMessage(database, 'm1', 'mine', spawnedAt + 10, 'user', [{ type: 'text', text: 'real' }]);
    database.prepare('INSERT INTO part (id, message_id, session_id, time_created, data) VALUES (?, ?, ?, ?, ?)')
      .run('m1-p9', 'm1', 'mine', spawnedAt + 10, 'not json');
    database.close();

    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: real']);
  });
});

// opencode 2.0 replaced the session/message/part tables with session_v2/session_message/session_part.
// A fresh 2.0 store has none of the old tables, so a reader that only knows the old schema resolves
// nothing and emits the "no harness transcript found" notification.
describe('OpencodeTranscriptSource with opencode v2 schema', () => {
  function createV2Schema(database: DatabaseSync): void {
    database.exec('CREATE TABLE session_v2 (id TEXT PRIMARY KEY, directory TEXT, parent_id TEXT, time_created INTEGER)');
    database.exec('CREATE TABLE session_message (id TEXT PRIMARY KEY, session_id TEXT, type TEXT, seq INTEGER, time_created INTEGER, data TEXT)');
    database.exec('CREATE TABLE session_part (message_id TEXT, session_id TEXT, ordinal INTEGER, type TEXT, data TEXT, PRIMARY KEY (message_id, ordinal))');
  }

  function addV2Session(database: DatabaseSync, id: string, directory: string, timeCreated: number, parentId: string | null): void {
    database.prepare('INSERT INTO session_v2 (id, directory, parent_id, time_created) VALUES (?, ?, ?, ?)')
      .run(id, directory, parentId, timeCreated);
  }

  function addV2Message(database: DatabaseSync, id: string, sessionId: string, type: string, seq: number, timeCreated: number, data: unknown): void {
    database.prepare('INSERT INTO session_message (id, session_id, type, seq, time_created, data) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, sessionId, type, seq, timeCreated, JSON.stringify(data));
  }

  it('resolves the session and reads user and assistant turns from session_message', () => {
    const database = openWritable();
    createV2Schema(database);
    addV2Session(database, 'ses_mine', cwd, spawnedAt, null);
    addV2Message(database, 'msg_1', 'ses_mine', 'user', 0, spawnedAt + 10, { type: 'user', text: 'v2 user prompt' });
    addV2Message(database, 'msg_2', 'ses_mine', 'assistant', 1, spawnedAt + 20, {
      type: 'assistant', content: [{ type: 'text', text: 'v2 answer' }],
    });
    database.close();

    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: v2 user prompt', 'assistant: v2 answer']);
    expect(source.resolved()).toBe(true);
  });

  it('renders a tool part whose output is a content block list', () => {
    const database = openWritable();
    createV2Schema(database);
    addV2Session(database, 'ses_mine', cwd, spawnedAt, null);
    addV2Message(database, 'msg_1', 'ses_mine', 'assistant', 0, spawnedAt + 10, {
      type: 'assistant',
      content: [{
        type: 'tool',
        id: 'call_1',
        name: 'shell',
        state: {
          status: 'completed',
          input: { command: 'ls' },
          content: [{ type: 'text', text: 'a.ts' }],
        },
      }],
    });
    database.close();

    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['assistant → shell({"command":"ls"})\nshell result: a.ts']);
  });

  it('prefers session_part rows over inline content in ordinal order', () => {
    const database = openWritable();
    createV2Schema(database);
    addV2Session(database, 'ses_mine', cwd, spawnedAt, null);
    addV2Message(database, 'msg_1', 'ses_mine', 'assistant', 0, spawnedAt + 10, {
      type: 'assistant', content: [{ type: 'text', text: 'inline' }],
    });
    database.prepare('INSERT INTO session_part (message_id, session_id, ordinal, type, data) VALUES (?, ?, ?, ?, ?)')
      .run('msg_1', 'ses_mine', 0, 'text', JSON.stringify({ type: 'text', text: 'part one' }));
    database.prepare('INSERT INTO session_part (message_id, session_id, ordinal, type, data) VALUES (?, ?, ?, ?, ?)')
      .run('msg_1', 'ses_mine', 1, 'text', JSON.stringify({ type: 'text', text: 'part two' }));
    database.close();

    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['assistant: part one', 'assistant: part two']);
  });

  it('includes a child session, labeled as a subagent', () => {
    const database = openWritable();
    createV2Schema(database);
    addV2Session(database, 'ses_mine', cwd, spawnedAt, null);
    addV2Session(database, 'ses_child', cwd, spawnedAt + 5, 'ses_mine');
    addV2Message(database, 'msg_1', 'ses_child', 'assistant', 0, spawnedAt + 10, {
      type: 'assistant', content: [{ type: 'text', text: 'subagent working' }],
    });
    database.close();

    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['[subagent ses_child] assistant: subagent working']);
  });

  it('includes grandchild turns through a nested subagent chain in the v2 schema', () => {
    const database = openWritable();
    createV2Schema(database);
    addV2Session(database, 'ses_mine', cwd, spawnedAt, null);
    addV2Session(database, 'ses_child', cwd, spawnedAt + 1, 'ses_mine');
    addV2Session(database, 'ses_grandchild', cwd, spawnedAt + 2, 'ses_child');
    addV2Message(database, 'msg_0', 'ses_mine', 'user', 0, spawnedAt + 3, { type: 'user', text: 'root turn' });
    addV2Message(database, 'msg_1', 'ses_child', 'assistant', 0, spawnedAt + 4, { type: 'assistant', content: [{ type: 'text', text: 'child turn' }] });
    addV2Message(database, 'msg_2', 'ses_grandchild', 'assistant', 0, spawnedAt + 5, { type: 'assistant', content: [{ type: 'text', text: 'grandchild turn' }] });
    database.close();
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual([
      'user: root turn',
      '[subagent ses_child] assistant: child turn',
      '[subagent ses_grandchild] assistant: grandchild turn',
    ]);
  });

  it('terminates when the v2 session table contains a parent_id cycle', () => {
    const database = openWritable();
    createV2Schema(database);
    addV2Session(database, 'ses_mine', cwd, spawnedAt, null);
    addV2Session(database, 'ses_child', cwd, spawnedAt + 1, 'ses_mine');
    addV2Session(database, 'ses_grandchild', cwd, spawnedAt + 2, 'ses_child');
    addV2Session(database, 'ses_loop_a', cwd, spawnedAt + 3, 'ses_grandchild');
    addV2Session(database, 'ses_loop_b', cwd, spawnedAt + 4, 'ses_loop_a');
    addV2Session(database, 'ses_self', cwd, spawnedAt + 5, 'ses_self');
    addV2Message(database, 'msg_0', 'ses_mine', 'user', 0, spawnedAt + 6, { type: 'user', text: 'root turn' });
    addV2Message(database, 'msg_1', 'ses_child', 'assistant', 0, spawnedAt + 7, { type: 'assistant', content: [{ type: 'text', text: 'child turn' }] });
    addV2Message(database, 'msg_2', 'ses_grandchild', 'assistant', 0, spawnedAt + 8, { type: 'assistant', content: [{ type: 'text', text: 'grandchild turn' }] });
    database.close();
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual([
      'user: root turn',
      '[subagent ses_child] assistant: child turn',
      '[subagent ses_grandchild] assistant: grandchild turn',
    ]);
  });

  it('returns only newer turns on a second read', () => {
    const database = openWritable();
    createV2Schema(database);
    addV2Session(database, 'ses_mine', cwd, spawnedAt, null);
    addV2Message(database, 'msg_1', 'ses_mine', 'user', 0, spawnedAt + 10, { type: 'user', text: 'first' });
    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: first']);
    expect(source.poll()).toEqual([]);
    addV2Message(database, 'msg_2', 'ses_mine', 'assistant', 1, spawnedAt + 20, {
      type: 'assistant', content: [{ type: 'text', text: 'second' }],
    });
    database.close();
    expect(source.poll()).toEqual(['assistant: second']);
  });

  it('ignores opencode bookkeeping message types', () => {
    const database = openWritable();
    createV2Schema(database);
    addV2Session(database, 'ses_mine', cwd, spawnedAt, null);
    addV2Message(database, 'msg_1', 'ses_mine', 'idle', 0, spawnedAt + 10, { type: 'idle', outcome: 'succeeded' });
    addV2Message(database, 'msg_2', 'ses_mine', 'model-switched', 1, spawnedAt + 20, { type: 'model-switched' });
    addV2Message(database, 'msg_3', 'ses_mine', 'user', 2, spawnedAt + 30, { type: 'user', text: 'real prompt' });
    database.close();

    const source = new OpencodeTranscriptSource(cwd, spawnedAt, home);
    expect(source.poll()).toEqual(['user: real prompt']);
  });
});
