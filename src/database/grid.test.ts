import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { countStatement, orderClause, resolveOrder, selectStatement, whereClause } from './grid-sql.js';
import type { DatabaseColumnView, DatabaseFilterView, DatabaseGridQuery } from '../protocol.js';
import { objectColumns } from './schema.js';
import { runGrid, totals } from './grid.js';
import { RowKeyStore } from './row-keys.js';

const COLUMNS: DatabaseColumnView[] = [
  { name: 'id', type: 'INTEGER', notNull: false, pk: 1 },
  { name: 'customer', type: 'TEXT', notNull: true, pk: 0 },
  { name: 'status', type: 'TEXT', notNull: false, pk: 0 },
];

function query(over: Partial<DatabaseGridQuery> = {}): DatabaseGridQuery {
  return { object: 'orders', filters: [], order: [], limit: 100, offset: 0, ...over };
}

function filter(over: Partial<DatabaseFilterView> = {}): DatabaseFilterView {
  return { column: 'status', op: 'eq', value: 'paid', ...over };
}

describe('whereClause', () => {
  it('emits each operator as the clause it should', () => {
    const cases: [DatabaseFilterView, string, (string | number)[]][] = [
      [filter({ op: 'eq' }), ' WHERE "status" = ?', ['paid']],
      [filter({ op: 'ne' }), ' WHERE "status" <> ?', ['paid']],
      [filter({ op: 'gt' }), ' WHERE "status" > ?', ['paid']],
      [filter({ op: 'gte' }), ' WHERE "status" >= ?', ['paid']],
      [filter({ op: 'lt' }), ' WHERE "status" < ?', ['paid']],
      [filter({ op: 'lte' }), ' WHERE "status" <= ?', ['paid']],
      [filter({ op: 'contains' }), ' WHERE "status" LIKE ?', ['%paid%']],
      [filter({ op: 'isNull' }), ' WHERE "status" IS NULL', []],
      [filter({ op: 'notNull' }), ' WHERE "status" IS NOT NULL', []],
    ];
    for (const [entry, text, values] of cases) {
      expect(whereClause([entry])).toEqual({ text, values });
    }
  });

  it('joins several filters with AND and concatenates their values', () => {
    expect(whereClause([filter(), filter({ column: 'total', op: 'gt', value: '10' })])).toEqual({
      text: ' WHERE "status" = ? AND "total" > ?',
      values: ['paid', 10],
    });
  });

  it('binds a comparison value that parses as a number as a number, and one that does not as text', () => {
    expect(whereClause([filter({ op: 'gte', value: '10' })]).values).toEqual([10]);
    expect(whereClause([filter({ op: 'gte', value: 'ten' })]).values).toEqual(['ten']);
    expect(whereClause([filter({ op: 'gte', value: '' })]).values).toEqual(['']);
  });

  it('escapes the LIKE wildcards a value itself contains', () => {
    expect(whereClause([filter({ op: 'contains', value: '50%_off' })]).values).toEqual([String.raw`%50\%\_off%`]);
  });

  it('binds a value that is SQL rather than interpolating any of it', () => {
    const injection = "x'; DROP TABLE orders; --";
    const clause = whereClause([filter({ value: injection })]);
    expect(clause.text).toBe(' WHERE "status" = ?');
    expect(clause.text).not.toContain('DROP');
    expect(clause.values).toEqual([injection]);
  });

  it('is empty for no filters', () => {
    expect(whereClause([])).toEqual({ text: '', values: [] });
  });
});

describe('resolveOrder', () => {
  it('keeps the order that was asked for', () => {
    expect(resolveOrder([{ column: 'status', desc: true }], COLUMNS)).toEqual([{ column: 'status', desc: true }]);
  });

  it('falls back to the primary key so a page has a total order', () => {
    expect(resolveOrder([], COLUMNS)).toEqual([{ column: 'id', desc: false }]);
  });

  it('falls back to the first column when there is no key', () => {
    const keyedless = [{ name: 'at', type: 'TEXT', notNull: false, pk: 0 }];
    expect(resolveOrder([], keyedless)).toEqual([{ column: 'at', desc: false }]);
  });
});

describe('orderClause', () => {
  it('renders one and two columns, both directions', () => {
    expect(orderClause([{ column: 'a', desc: false }])).toBe(' ORDER BY "a" ASC');
    expect(orderClause([{ column: 'a', desc: true }, { column: 'b', desc: false }]))
      .toBe(' ORDER BY "a" DESC, "b" ASC');
    expect(orderClause([])).toBe('');
  });
});

describe('selectStatement', () => {
  it('selects every column with the page applied last', () => {
    expect(selectStatement(query(), COLUMNS)).toEqual({
      sql: 'SELECT "id", "customer", "status" FROM "orders" ORDER BY "id" ASC LIMIT ? OFFSET ?',
      parameters: [100, 0],
    });
  });

  it('puts the filters before the order and binds the page after the filter values', () => {
    expect(selectStatement(query({ filters: [filter()], order: [{ column: 'status', desc: true }], limit: 50, offset: 100 }), COLUMNS)).toEqual({
      sql: 'SELECT "id", "customer", "status" FROM "orders" WHERE "status" = ? ORDER BY "status" DESC LIMIT ? OFFSET ?',
      parameters: ['paid', 50, 100],
    });
  });

  it('yields no statement for an object with no columns', () => {
    expect(selectStatement(query(), [])).toEqual({ sql: '', parameters: [] });
  });
});

describe('countStatement', () => {
  it('counts with the same filter and binds the same values', () => {
    expect(countStatement(query({ filters: [filter()] }))).toEqual({
      sql: 'SELECT COUNT(*) AS n FROM "orders" WHERE "status" = ?',
      parameters: ['paid'],
    });
  });
});

const SHOP = `
  CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT NOT NULL, status TEXT, total REAL);
  INSERT INTO orders (customer, status, total) VALUES
    ('ada', 'paid', 10), ('bo', 'open', 20), ('cy', 'paid', 30), ('di', 'open', 40), ('ed', 'paid', 50);
`;

function withDb<T>(sql: string, run: (database: DatabaseSync) => T): T {
  const database = new DatabaseSync(':memory:');
  try {
    database.exec(sql);
    return run(database);
  } finally {
    database.close();
  }
}

describe('runGrid', () => {
  it('returns one page of cells, the filtered total, and the unfiltered total', () => {
    const keys = new RowKeyStore();
    const grid = withDb(SHOP, (database) => {
      const columns = objectColumns(database, 'orders');
      return runGrid(database, 'shop', query({ filters: [filter()], limit: 2 }), columns, keys);
    });
    expect(grid.columns).toEqual(['id', 'customer', 'status', 'total']);
    expect(grid.rows.map((row) => row.cells[1].text)).toEqual(['ada', 'cy']);
    expect(grid.total).toBe(3);
    expect(grid.unfilteredTotal).toBe(3);
    expect(grid.order).toEqual([{ column: 'id', desc: false }]);
  });

  it('reports a filtered total beside the object total so a narrowing filter is visible', () => {
    const keys = new RowKeyStore();
    const grid = withDb(SHOP, (database) => {
      const columns = objectColumns(database, 'orders');
      runGrid(database, 'shop', query(), columns, keys);
      return runGrid(database, 'shop', query({ filters: [filter()] }), columns, keys, 5);
    });
    expect(grid.total).toBe(3);
    expect(grid.unfilteredTotal).toBe(5);
  });

  it('renders the header for an object whose page is empty', () => {
    const keys = new RowKeyStore();
    const grid = withDb(SHOP, (database) => {
      const columns = objectColumns(database, 'orders');
      return runGrid(database, 'shop', query({ filters: [filter({ value: 'nope' })] }), columns, keys);
    });
    expect(grid.rows).toEqual([]);
    expect(grid.columns).toEqual(['id', 'customer', 'status', 'total']);
    expect(grid.total).toBe(0);
  });

  it('returns no rows and the real total for a page past the end', () => {
    const keys = new RowKeyStore();
    const grid = withDb(SHOP, (database) => {
      const columns = objectColumns(database, 'orders');
      return runGrid(database, 'shop', query({ limit: 10, offset: 50 }), columns, keys);
    });
    expect(grid.rows).toEqual([]);
    expect(grid.total).toBe(5);
  });

  it('mints a key per row that resolves to the primary key values it came from', () => {
    const keys = new RowKeyStore();
    const page = withDb(SHOP, (database) => {
      const columns = objectColumns(database, 'orders');
      return runGrid(database, 'shop', query(), columns, keys);
    });
    expect(page.rows.map((row) => keys.resolve(row.key))).toEqual([
      { database: 'shop', object: 'orders', values: [1] },
      { database: 'shop', object: 'orders', values: [2] },
      { database: 'shop', object: 'orders', values: [3] },
      { database: 'shop', object: 'orders', values: [4] },
      { database: 'shop', object: 'orders', values: [5] },
    ]);
  });

  it('mints no keys for a table with no primary key', () => {
    const keys = new RowKeyStore();
    const page = withDb(
      'CREATE TABLE logs (line TEXT); INSERT INTO logs VALUES (\'a\');',
      (database) => runGrid(database, 'shop', query({ object: 'logs' }), objectColumns(database, 'logs'), keys),
    );
    expect(page.rows[0]?.key).toBe('');
    expect(keys.resolve('')).toBeUndefined();
  });

  it('yields an empty grid for an object with no columns rather than throwing', () => {
    const keys = new RowKeyStore();
    const grid = withDb(SHOP, (database) => runGrid(database, 'shop', query({ object: 'nope' }), [], keys));
    expect(grid).toMatchObject({ sql: '', rows: [], total: 0 });
  });
});

describe('totals', () => {
  it('reports the same figure for both totals with no filter', () => {
    expect(withDb(SHOP, (database) => totals(database, query()))).toEqual({ total: 5, unfilteredTotal: 5 });
  });

  it('keeps a supplied unfiltered total beside the filtered one', () => {
    expect(withDb(SHOP, (database) => totals(database, query({ filters: [filter()] }), 5)))
      .toEqual({ total: 3, unfilteredTotal: 5 });
  });
});
