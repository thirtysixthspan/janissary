import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
  home = mkdtempSync(path.join(tmpdir(), 'janus-opencode-'));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('OpencodeTranscriptSource', () => {
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
