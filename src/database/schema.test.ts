import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { isWritable, objectColumns, primaryKeyColumns, quoteIdentifier, schemaObjects } from './schema.js';

function withDb<T>(sql: string, run: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(sql);
    return run(database);
  } finally {
    database.close();
  }
}

const SHOP = `
  CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, status TEXT, total REAL);
  CREATE TABLE logs (at TEXT, line TEXT);
  CREATE VIEW paid AS SELECT id, customer FROM orders WHERE status = 'paid';
  CREATE INDEX orders_status ON orders (status);
  CREATE TRIGGER orders_touch AFTER UPDATE ON orders BEGIN SELECT 1; END;
`;

describe('quoteIdentifier', () => {
  it('wraps a name and doubles an interior quote', () => {
    expect(quoteIdentifier('orders')).toBe('"orders"');
    expect(quoteIdentifier('we"ird')).toBe('"we""ird"');
  });
});

describe('schemaObjects', () => {
  it('lists every object, grouped tables first, with sqlite internals excluded', () => {
    const objects = withDb(SHOP, schemaObjects);
    expect(objects.map((object) => `${object.kind}:${object.name}`)).toEqual([
      'table:logs',
      'table:orders',
      'view:paid',
      'index:orders_status',
      'trigger:orders_touch',
    ]);
  });

  it('gives a table its declared types, not-null, and primary-key ordinals', () => {
    const orders = withDb(SHOP, (database) => schemaObjects(database).find((object) => object.name === 'orders'));
    expect(orders?.columns).toEqual([
      { name: 'id', type: 'INTEGER', notNull: false, pk: 1 },
      { name: 'customer', type: 'TEXT', notNull: true, pk: 0 },
      { name: 'status', type: 'TEXT', notNull: false, pk: 0 },
      { name: 'total', type: 'REAL', notNull: false, pk: 0 },
    ]);
  });

  it('gives a view the columns it selects', () => {
    const paid = withDb(SHOP, (database) => schemaObjects(database).find((object) => object.name === 'paid'));
    expect(paid?.columns.map((column) => column.name)).toEqual(['id', 'customer']);
  });

  it('lists nothing for an empty database', () => {
    expect(withDb('', schemaObjects)).toEqual([]);
  });

  it('reports a view as read-only and a keyless table as read-only', () => {
    const objects = withDb(SHOP, schemaObjects);
    const byName = (name: string) => objects.find((object) => object.name === name);
    expect(byName('orders')?.writable).toBe(true);
    expect(byName('logs')?.writable).toBe(false);
    expect(byName('paid')?.writable).toBe(false);
    expect(byName('orders_touch')?.writable).toBe(false);
  });
});

describe('objectColumns', () => {
  it('yields an empty list for a name that is not there, rather than throwing', () => {
    expect(withDb(SHOP, (database) => objectColumns(database, 'nope'))).toEqual([]);
  });
});

describe('primaryKeyColumns', () => {
  it('orders a composite key by its ordinal', () => {
    withDb('CREATE TABLE pair (a TEXT, b TEXT, PRIMARY KEY (b, a))', (database) => {
      expect(primaryKeyColumns(objectColumns(database, 'pair')).map((column) => column.name)).toEqual(['b', 'a']);
    });
  });

  it('finds no key in a table without one', () => {
    withDb('CREATE TABLE logs (a TEXT)', (database) => {
      expect(primaryKeyColumns(objectColumns(database, 'logs'))).toEqual([]);
    });
  });
});

describe('isWritable', () => {
  it('is true only for a table with a key', () => {
    expect(isWritable('table', [{ name: 'a', type: 'TEXT', notNull: false, pk: 1 }])).toBe(true);
    expect(isWritable('table', [{ name: 'a', type: 'TEXT', notNull: false, pk: 0 }])).toBe(false);
    expect(isWritable('view', [{ name: 'a', type: 'TEXT', notNull: false, pk: 1 }])).toBe(false);
  });
});
