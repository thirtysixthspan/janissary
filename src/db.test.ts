import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseDbCommand as parseDatabaseCommand, runDbCommand as runDatabaseCommand, extractDbCommand as extractDatabaseCommand } from './db.js';
import { initDbDir, closeConnection, closeAllConnections, listOpenConnections } from './connections.js';

describe('parseDbCommand', () => {
  it('rejects empty input with usage', () => {
    const r = parseDatabaseCommand('db');
    expect('error' in r && r.error).toContain('Usage');
  });

  it('parses create/delete (engine first)', () => {
    expect(parseDatabaseCommand('db sqlite create mydb')).toEqual({ action: 'create', name: 'mydb' });
    expect(parseDatabaseCommand('db sqlite delete mydb')).toEqual({ action: 'delete', name: 'mydb' });
  });

  it('parses list', () => {
    expect(parseDatabaseCommand('db sqlite list')).toEqual({ action: 'list' });
  });

  it('parses query and preserves the SQL verbatim (including extra spaces)', () => {
    expect(parseDatabaseCommand('db sqlite query mydb SELECT  *  FROM t')).toEqual({
      action: 'query',
      name: 'mydb',
      query: 'SELECT  *  FROM t',
    });
  });

  it('strips surrounding quotes around the SQL', () => {
    expect(parseDatabaseCommand('db sqlite query movies "SELECT * FROM actors"')).toEqual({
      action: 'query',
      name: 'movies',
      query: 'SELECT * FROM actors',
    });
    expect(parseDatabaseCommand("db sqlite query movies 'SELECT * FROM actors'")).toEqual({
      action: 'query',
      name: 'movies',
      query: 'SELECT * FROM actors',
    });
  });

  it('preserves quotes inside an unquoted SQL string literal', () => {
    expect(parseDatabaseCommand("db sqlite query movies SELECT * FROM actors WHERE name = 'Bob'")).toEqual({
      action: 'query',
      name: 'movies',
      query: "SELECT * FROM actors WHERE name = 'Bob'",
    });
  });

  it('rejects unsupported engines', () => {
    const r = parseDatabaseCommand('db postgres create mydb');
    expect('error' in r && r.error).toContain('Only "sqlite"');
  });

  it('shows usage when the old action-first word order is used', () => {
    const r = parseDatabaseCommand('db create sqlite mydb');
    expect('error' in r && r.error).toContain('db sqlite');
  });

  it('rejects unsafe database names (path traversal)', () => {
    const r = parseDatabaseCommand('db sqlite create ../evil');
    expect('error' in r && r.error).toContain('Invalid database name');
  });

  it('requires a name for create/delete and SQL for query', () => {
    expect('error' in parseDatabaseCommand('db sqlite create')).toBe(true);
    expect('error' in parseDatabaseCommand('db sqlite query mydb')).toBe(true);
  });
});

describe('extractDbCommand', () => {
  it('extracts a command on the final line', () => {
    const reply = "Sure — here's how to store that:\ndb sqlite create shop";
    expect(extractDatabaseCommand(reply)).toBe('db sqlite create shop');
  });

  it('extracts a command from inside a code fence', () => {
    const reply = 'Run this:\n```sh\ndb sqlite query shop SELECT * FROM items\n```';
    expect(extractDatabaseCommand(reply)).toBe('db sqlite query shop SELECT * FROM items');
  });

  it('tolerates a leading shell prompt marker and inline backticks', () => {
    expect(extractDatabaseCommand('$ db sqlite list')).toBe('db sqlite list');
    expect(extractDatabaseCommand('`db sqlite delete shop`')).toBe('db sqlite delete shop');
  });

  it('returns the last db command when several appear', () => {
    const reply = 'db sqlite create a\n...then...\ndb sqlite query a SELECT 1';
    expect(extractDatabaseCommand(reply)).toBe('db sqlite query a SELECT 1');
  });

  it('returns null when there is no db command', () => {
    expect(extractDatabaseCommand('I cannot help with that.')).toBeNull();
    expect(extractDatabaseCommand('the database is ready')).toBeNull();
  });
});

describe('runDbCommand', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'janus-db-'));
    initDbDir(dir);
  });
  afterAll(() => {
    closeAllConnections();
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates, lists, persists data, queries, and deletes a database', () => {
    expect(runDatabaseCommand('db sqlite create shop')).toContain('Created');
    expect(existsSync(join(dir, '.janissary', 'db', 'sqlite', 'shop.sqlite'))).toBe(true);

    // Duplicate create is reported, not an error.
    expect(runDatabaseCommand('db sqlite create shop')).toContain('already exists');

    expect(runDatabaseCommand('db sqlite list')).toContain('shop');

    expect(runDatabaseCommand('db sqlite query shop CREATE TABLE items(id INTEGER, name TEXT)')).toBe('OK.');
    expect(runDatabaseCommand("db sqlite query shop INSERT INTO items VALUES (1, 'widget')")).toBe('OK.');

    const out = runDatabaseCommand('db sqlite query shop SELECT * FROM items');
    expect(out).toContain('id');
    expect(out).toContain('name');
    expect(out).toContain('widget');
    expect(out).toContain('(1 row)');

    expect(runDatabaseCommand('db sqlite delete shop')).toContain('Deleted');
    expect(existsSync(join(dir, '.janissary', 'db', 'sqlite', 'shop.sqlite'))).toBe(false);
  });

  it('reports a missing database on query/delete', () => {
    expect(runDatabaseCommand('db sqlite query ghost SELECT 1')).toContain('does not exist');
    expect(runDatabaseCommand('db sqlite delete ghost')).toContain('does not exist');
  });

  it('reports SQL errors without crashing', () => {
    runDatabaseCommand('db sqlite create errs');
    expect(runDatabaseCommand('db sqlite query errs SELECT * FROM nope')).toContain('Query error');
  });

  it('returns an empty-result marker for a no-row SELECT', () => {
    runDatabaseCommand('db sqlite create empty');
    runDatabaseCommand('db sqlite query empty CREATE TABLE t(a)');
    expect(runDatabaseCommand('db sqlite query empty SELECT * FROM t')).toContain('(0 rows)');
  });

  it('keeps the connection open across commands (connection-scoped TEMP table persists)', () => {
    runDatabaseCommand('db sqlite create sess');
    expect(listOpenConnections()).toContain('sess');
    // A TEMP table is scoped to a single connection — it survives only because
    // the same persistent connection is reused on the next command.
    expect(runDatabaseCommand('db sqlite query sess CREATE TEMP TABLE scratch(x)')).toBe('OK.');
    expect(runDatabaseCommand('db sqlite query sess INSERT INTO scratch VALUES (42)')).toBe('OK.');
    expect(runDatabaseCommand('db sqlite query sess SELECT x FROM scratch')).toContain('42');
  });

  it('closeConnection drops the TEMP table and removes it from the open list', () => {
    runDatabaseCommand('db sqlite create drop');
    runDatabaseCommand('db sqlite query drop CREATE TEMP TABLE t(x)');
    expect(closeConnection('drop')).toBe(true);
    expect(listOpenConnections()).not.toContain('drop');
    // Closing it returns false the second time.
    expect(closeConnection('drop')).toBe(false);
    // A fresh connection no longer sees the TEMP table.
    expect(runDatabaseCommand('db sqlite query drop SELECT * FROM t')).toContain('Query error');
  });

  it('delete closes any open connection before removing the file', () => {
    runDatabaseCommand('db sqlite create gone');
    expect(listOpenConnections()).toContain('gone');
    expect(runDatabaseCommand('db sqlite delete gone')).toContain('Deleted');
    expect(listOpenConnections()).not.toContain('gone');
  });
});
