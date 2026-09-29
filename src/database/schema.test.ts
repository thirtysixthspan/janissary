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
  CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE invoice (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id));
  CREATE TABLE pairing (a TEXT, b TEXT, PRIMARY KEY (a, b), FOREIGN KEY (a, b) REFERENCES customers(id, name));
  CREATE TABLE selfref (id INTEGER PRIMARY KEY, parent INTEGER REFERENCES selfref(id));
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
      'table:customers',
      'table:invoice',
      'table:logs',
      'table:orders',
      'table:pairing',
      'table:selfref',
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
describe('foreign keys', () => {
  it('carries the referenced table and column on the key column, and nothing on the others', () => {
    withDb(SHOP, (database) => {
      const invoice = objectColumns(database, 'invoice');
      expect(invoice[1]?.references).toEqual({ table: 'customers', columns: ['id'] });
      expect(invoice[0]?.references).toBeUndefined();
      expect(objectColumns(database, 'orders')[2]?.references).toBeUndefined();
    });
  });

  it('pairs a composite key across its seq order', () => {
    withDb(SHOP, (database) => {
      const pairing = objectColumns(database, 'pairing');
      expect(pairing.find((column) => column.name === 'a')?.references).toEqual({ table: 'customers', columns: ['id', 'name'] });
      expect(pairing.find((column) => column.name === 'b')?.references).toEqual({ table: 'customers', columns: ['id', 'name'] });
    });
  });

  it('resolves a key that names no target column to the referenced primary key', () => {
    withDb(`CREATE TABLE owner (id INTEGER PRIMARY KEY); CREATE TABLE pet (name TEXT, owner_id INTEGER REFERENCES owner);`, (database) => {
      expect(objectColumns(database, 'pet')[1]?.references).toEqual({ table: 'owner', columns: ['id'] });
    });
  });
  it('leaves the target empty rather than guessing when the referenced key is composite', () => {
    withDb('CREATE TABLE pair (x TEXT, y TEXT, PRIMARY KEY (x, y)); CREATE TABLE link (a TEXT REFERENCES pair);', (database) => {
      expect(objectColumns(database, 'link')[0]?.references).toEqual({ table: 'pair', columns: [''] });
    });
  });

  // `primaryKeyOf` resolves a key that names no target column, and it reads the pragma directly
  // rather than through `objectColumns` — so a table that references itself terminates.
  it('resolves a self-reference without recursing', () => {
    withDb(SHOP, (database) => {
      expect(objectColumns(database, 'selfref')[1]?.references).toEqual({ table: 'selfref', columns: ['id'] });
    });
  });
});
