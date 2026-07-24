import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { queryDatabase } from './query.js';
import { initDbDir, closeAllConnections, getConnection } from '../connections.js';

describe('queryDatabase', () => {
  let dir = '';
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'janus-query-'));
    initDbDir(dir);
  });
  afterAll(() => {
    closeAllConnections();
    rmSync(dir, { recursive: true, force: true });
  });
  afterEach(() => {
    closeAllConnections();
  });

  it('reports a missing database', () => {
    const output = queryDatabase('nope', 'select 1');
    expect(output).toBe('Database "nope" does not exist. Create it with: db sqlite create nope');
  });

  it.each(['select 1', 'PRAGMA table_info(x)', 'with t as (select 1) select * from t', 'explain select 1'])(
    'routes "%s" through the read path',
    (query) => {
      getConnection('reads');
      const output = queryDatabase('reads', query);
      expect(output).not.toBe('OK.');
    },
  );

  it('routes a create statement through the write path', () => {
    getConnection('writes');
    const output = queryDatabase('writes', 'create table t (id integer)');
    expect(output).toBe('OK.');
  });

  it('routes insert/update/delete through the write path', () => {
    getConnection('writes2');
    queryDatabase('writes2', 'create table t (id integer)');
    expect(queryDatabase('writes2', 'insert into t (id) values (1)')).toBe('OK.');
    expect(queryDatabase('writes2', 'update t set id = 2')).toBe('OK.');
    expect(queryDatabase('writes2', 'delete from t')).toBe('OK.');
  });

  it('returns a query error instead of throwing on invalid sql', () => {
    getConnection('errors');
    queryDatabase('errors', 'create table t (id integer)');
    const output = queryDatabase('errors', 'select * from does_not_exist');
    expect(output).toMatch(/^Query error: /);
  });

  it('formats a zero-row result set', () => {
    getConnection('empty');
    queryDatabase('empty', 'create table t (id integer)');
    const output = queryDatabase('empty', 'select * from t');
    expect(output).toBe('(0 rows)');
  });

  it('formats mixed-type cells, padding columns to the widest value', () => {
    getConnection('mixed');
    queryDatabase('mixed', 'create table t (id integer, name text, note text)');
    queryDatabase('mixed', "insert into t (id, name, note) values (1, 'ab', null)");
    queryDatabase('mixed', "insert into t (id, name, note) values (22, 'x', 'hello')");

    const output = queryDatabase('mixed', 'select id, name, note from t');

    const lines = output.split('\n');
    expect(lines[0]).toBe('id  name  note ');
    expect(lines[1]).toBe('--  ----  -----');
    expect(lines[2]).toBe('1   ab         ');
    expect(lines[3]).toBe('22  x     hello');
    expect(lines.at(-1)).toBe('(2 rows)');
  });
});
