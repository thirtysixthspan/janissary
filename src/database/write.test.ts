import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { runGrid } from './grid.js';
import { RowKeyStore } from './row-keys.js';
import { objectColumns } from './schema.js';
import type { DatabaseGridQuery } from '../protocol.js';
import { deleteRow, insertRow, updateCell } from './write.js';

const SHOP = `
  CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, status TEXT, total REAL);
  INSERT INTO orders (customer, status, total) VALUES ('ada', 'paid', 10), ('bo', 'open', 20);
  CREATE TABLE logs (line TEXT);
  INSERT INTO logs VALUES ('first'), ('second');
  CREATE VIEW paid AS SELECT id, customer FROM orders WHERE status = 'paid';
`;

function query(over: Partial<DatabaseGridQuery> = {}): DatabaseGridQuery {
  return { object: 'orders', filters: [], order: [], limit: 100, offset: 0, ...over };
}

function withDb<T>(run: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(SHOP);
    return run(database);
  } finally {
    database.close();
  }
}

// The one accessor the write path still needs, as `DatabaseBrowser` supplies it.
const columnsOf = (database: DatabaseSync) => (object: string) => objectColumns(database, object);

function keyFor(database: DatabaseSync, keys: RowKeyStore, id: number): string {
  const page = runGrid(database, query(), objectColumns(database, 'orders'), keys);
  return page.rows[id - 1]?.key ?? '';
}

describe('updateCell', () => {
  it('changes one row, reports one change, and leaves the other alone', () => {
    withDb((database) => {
      const keys = new RowKeyStore();
      const outcome = updateCell(keys, keyFor(database, keys, 2), 'status', 'shipped', columnsOf(database), database);
      expect(outcome).toMatchObject({ ok: true, changed: 1, sql: 'UPDATE "orders" SET "status" = ? WHERE "id" = ?', parameters: ['shipped', 2] });
      const rows = database.prepare('SELECT id, status FROM orders ORDER BY id').all();
      expect(rows).toEqual([
        { id: 1, status: 'paid' },
        { id: 2, status: 'shipped' },
      ]);
    });
  });

  it('writes a null when the value is one, and the empty string when it is not', () => {
    withDb((database) => {
      const keys = new RowKeyStore();
      updateCell(keys, keyFor(database, keys, 1), 'status', null, columnsOf(database), database);
      updateCell(keys, keyFor(database, keys, 2), 'status', '', columnsOf(database), database);
      const rows = database.prepare('SELECT id, status IS NULL AS "wasNull", status FROM orders ORDER BY id').all();
      expect(rows).toEqual([
        { id: 1, wasNull: 1, status: null },
        { id: 2, wasNull: 0, status: '' },
      ]);
    });
  });

  it('refuses a key the store no longer resolves, rather than retargeting the write', () => {
    withDb((database) => {
      const keys = new RowKeyStore();
      expect(updateCell(keys, 'r999', 'status', 'x', columnsOf(database), database))
        .toEqual({ ok: false, error: 'That row is no longer loaded. Refresh and try again.' });
    });
  });

  it('refuses a key that was never minted, since a keyless table mints none', () => {
    withDb((database) => {
      expect(updateCell(new RowKeyStore(), 'r1', 'line', 'x', columnsOf(database), database))
        .toEqual({ ok: false, error: 'That row is no longer loaded. Refresh and try again.' });
    });
  });

  it('refuses a column the table does not have', () => {
    withDb((database) => {
      const keys = new RowKeyStore();
      const outcome = updateCell(keys, keyFor(database, keys, 1), 'nope', 'x', columnsOf(database), database);
      expect(outcome).toEqual({ ok: false, error: '"orders" has no column "nope".' });
    });
  });
});

describe('deleteRow', () => {
  it('removes exactly the addressed row', () => {
    withDb((database) => {
      const keys = new RowKeyStore();
      const outcome = deleteRow(keys, keyFor(database, keys, 1), columnsOf(database), database);
      expect(outcome).toMatchObject({ ok: true, changed: 1, sql: 'DELETE FROM "orders" WHERE "id" = ?' });
      expect(database.prepare('SELECT id FROM orders').all()).toEqual([{ id: 2 }]);
    });
  });

  it('refuses a key the store no longer resolves', () => {
    withDb((database) => {
      expect(deleteRow(new RowKeyStore(), 'r1', columnsOf(database), database))
        .toEqual({ ok: false, error: 'That row is no longer loaded. Refresh and try again.' });
    });
  });
});

describe('insertRow', () => {
  it('adds a row with the values given and a null for the ones not', () => {
    withDb((database) => {
      const outcome = insertRow('orders', [
        { column: 'customer', value: 'zed' },
        { column: 'status', value: null },
      ], objectColumns(database, 'orders'), database);
      expect(outcome).toMatchObject({
        ok: true,
        changed: 1,
        sql: 'INSERT INTO "orders" ("customer", "status") VALUES (?, ?)',
      });
      const row = database.prepare('SELECT customer, status FROM orders WHERE customer = ?').get('zed');
      expect(row).toEqual({ customer: 'zed', status: null });
    });
  });

  it('refuses a table with no primary key', () => {
    withDb((database) => {
      expect(insertRow('logs', [{ column: 'line', value: 'x' }], objectColumns(database, 'logs'), database))
        .toEqual({ ok: false, error: 'This table has no primary key, so its rows cannot be addressed.' });
    });
  });

  it('refuses a cell naming a column the table does not have', () => {
    withDb((database) => {
      const outcome = insertRow('orders', [{ column: 'nope', value: 'x' }], objectColumns(database, 'orders'), database);
      expect(outcome).toEqual({ ok: false, error: '"nope" is not a column of this table.' });
    });
  });

  it('refuses a row that omits the columns it may leave to SQLite', () => {
    withDb((database) => {
      const outcome = insertRow('orders', [{ column: 'nope', value: 'x' }], objectColumns(database, 'orders'), database);
      expect(outcome).toEqual({ ok: false, error: '"nope" is not a column of this table.' });
    });
  });

  it('names only the columns it was given, so SQLite assigns the rest', () => {
    withDb((database) => {
      const outcome = insertRow('orders', [{ column: 'customer', value: 'auto' }], objectColumns(database, 'orders'), database);
      expect(outcome).toMatchObject({ ok: true, sql: 'INSERT INTO "orders" ("customer") VALUES (?)' });
      const row = database.prepare('SELECT id, status FROM orders WHERE customer = ?').get('auto');
      expect(row).toEqual({ id: 3, status: null });
    });
  });

  // The two shapes the spec now tells apart: a column named with a null stores the null, and only a
  // column the statement does not name reaches its `DEFAULT`.
  it('stores the null a column left alone carries, rather than its default', () => {
    withDb((database) => {
      database.exec('CREATE TABLE priced (id INTEGER PRIMARY KEY, n INTEGER DEFAULT 7, s TEXT DEFAULT \'fallback\')');
      const columns = objectColumns(database, 'priced');
      const outcome = insertRow('priced', [{ column: 'id', value: null }, { column: 'n', value: null }, { column: 's', value: null }], columns, database);
      expect(outcome).toMatchObject({ ok: true, sql: 'INSERT INTO "priced" ("id", "n", "s") VALUES (?, ?, ?)' });
      expect(database.prepare('SELECT n, s FROM priced WHERE id = 1').get()).toEqual({ n: null, s: null });
      insertRow('priced', [{ column: 'id', value: null }, { column: 'n', value: null }], columns, database);
      expect(database.prepare('SELECT s FROM priced WHERE id = 2').get()).toEqual({ s: 'fallback' });
    });
  });
});

describe('RowKeyStore', () => {
  it('releases a superseded page and refuses its keys', () => {
    withDb((database) => {
      const keys = new RowKeyStore();
      const first = keyFor(database, keys, 1);
      for (let page = 0; page < 9; page++) runGrid(database, query(), objectColumns(database, 'orders'), keys);
      expect(keys.resolve(first)).toBeUndefined();
      expect(updateCell(keys, first, 'status', 'x', columnsOf(database), database).ok).toBe(false);
    });
  });

  it('still resolves the newest page after several earlier ones', () => {
    withDb((database) => {
      const keys = new RowKeyStore();
      for (let page = 0; page < 3; page++) runGrid(database, query(), objectColumns(database, 'orders'), keys);
      expect(keys.resolve(keyFor(database, keys, 1))).toBeDefined();
    });
  });
});
