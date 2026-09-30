import { describe, expect, it } from 'vitest';
import { insertStatement, isSqlPayload, type SqlColumn, type SqlPayload } from './shared.js';
import {
  isExportIntent,
  isInsertRowIntent,
  isOpenIntent,
  isSetColumnsIntent,
  isSetFilterEnabledIntent,
  isSetFilterIntent,
  isSetGlobalFilterIntent,
  isSetPageIntent,
  isSelectObjectIntent,
  isSetPageSizeIntent,
  isUpdateCellIntent,
  PAGE_SIZES,
} from './shared-intents.js';

function payload(over: Partial<SqlPayload> = {}): SqlPayload {
  return {
    database: 'shop',
    databases: [{ name: 'shop', exists: true, open: true }],
    objects: [{ name: 'orders', kind: 'table', writable: true, columns: [{ name: 'id', type: 'INTEGER', notNull: false, pk: 1 }] }],
    object: 'orders',
    filters: [],
    hidden: [],
    global: '',
    order: [],
    limit: 100,
    offset: 0,
    pageSizes: [50, 100, 500],
    grid: null,
    log: [],
    exports: [],
    error: null,
    pending: null,
    ...over,
  };
}

describe('isSqlPayload', () => {
  it('accepts a well-formed payload', () => {
    expect(isSqlPayload(payload())).toBe(true);
  });

  it('rejects an array and null', () => {
    expect(isSqlPayload([])).toBe(false);
    expect(isSqlPayload(null)).toBe(false);
  });

  it('rejects a missing required field', () => {
    const withoutLimit: Record<string, unknown> = { ...payload() };
    delete withoutLimit.limit;
    expect(isSqlPayload(withoutLimit)).toBe(false);
  });

  it('rejects a wrongly-typed field', () => {
    expect(isSqlPayload(payload({ limit: '100' as never }))).toBe(false);
    expect(isSqlPayload(payload({ database: 7 as never }))).toBe(false);
    expect(isSqlPayload(payload({ objects: [{ name: 'x' }] as never }))).toBe(false);
  });

  it('rejects a column whose key is malformed, and accepts one that is well-formed', () => {
    const keyed = (references: unknown) => payload({
      objects: [{ name: 't', kind: 'table', writable: true, columns: [{ name: 'a', type: 'INTEGER', notNull: false, pk: 0, references }] }] as never,
    });
    expect(isSqlPayload(keyed({ table: 'c', columns: ['id'] }))).toBe(true);
    expect(isSqlPayload(keyed({ table: 'c', columns: 'id' }))).toBe(false);
    expect(isSqlPayload(keyed({ table: 7, columns: ['id'] }))).toBe(false);
    expect(isSqlPayload(keyed(null))).toBe(false);
  });

  // A tab restored from a profile saved before the flag existed carries filters with none at all,
  // and the contract has to read one as a filter rather than refuse the whole payload.
  it('accepts a filter with or without the enabled flag, and refuses one that is not a boolean', () => {
    const filtered = (enabled: unknown) => payload({ filters: [{ column: 'status', op: 'eq', value: 'paid', enabled }] } as never);
    expect(isSqlPayload(filtered(undefined))).toBe(true);
    expect(isSqlPayload(filtered(true))).toBe(true);
    expect(isSqlPayload(filtered(false))).toBe(true);
    expect(isSqlPayload(filtered('no'))).toBe(false);
  });


  it('accepts a populated grid, console, exports, error, and pending', () => {
    expect(isSqlPayload(payload({
      grid: {
        sql: 'SELECT 1', parameters: [1], columns: ['a'],
        rows: [{ key: 'r1', cells: [{ text: 'x', isNull: false }] }],
        total: 1, unfilteredTotal: 4, offset: 0, limit: 100, order: [{ column: 'a', desc: false }],
      },
      log: [{ sql: 'UPDATE t', changed: 1 }],
      exports: [{ name: 'shop-orders-1.csv', size: '1.2 kB', rows: 4, ref: '/open/7' }],
      error: 'Query error: nope',
      pending: { id: 'q1', followUp: 'query' },
    }))).toBe(true);
  });

  it('rejects a grid with a malformed cell, and a pending with an unknown follow-up', () => {
    expect(isSqlPayload(payload({
      grid: { sql: 's', parameters: [], columns: [], rows: [{ key: 'r1', cells: [{ text: 1, isNull: false }] }], total: 0, unfilteredTotal: 0, offset: 0, limit: 1, order: [] } as never,
    }))).toBe(false);
    expect(isSqlPayload(payload({ pending: { id: 'q1', followUp: 'delete' } as never }))).toBe(false);
  });

  // The flag a cut-off console read carries is what tells the range line to stop reporting a total,
  // so a guard that refused it would turn a label into a plugin failure.
  it('accepts a grid the console cut off, and refuses a flag that is not a boolean', () => {
    const cut = (truncated: unknown) => payload({
      grid: {
        sql: 'SELECT x FROM t', parameters: [], columns: ['x'],
        rows: [{ key: 'r1', cells: [{ text: '1', isNull: false }] }],
        total: 200, unfilteredTotal: 200, offset: 0, limit: 200, order: [], truncated,
      } as never,
    });
    expect(isSqlPayload(cut(true))).toBe(true);
    expect(isSqlPayload(cut(false))).toBe(true);
    expect(isSqlPayload(cut(undefined))).toBe(true);
    expect(isSqlPayload(cut('yes'))).toBe(false);
  });

  // A statement's result is read-only because its rows carry no identity, and the tab needs the
  // server's word for that rather than inferring it from rows it cannot write to anyway.
  it('accepts a keyless grid, and refuses a keyless flag that is not a boolean', () => {
    const keyless = (keyless: unknown) => payload({
      grid: {
        sql: 'SELECT x FROM t', parameters: [], columns: ['x'],
        rows: [{ key: '', cells: [{ text: '1', isNull: false }] }],
        total: 1, unfilteredTotal: 1, offset: 0, limit: 200, order: [], keyless,
      } as never,
    });
    expect(isSqlPayload(keyless(true))).toBe(true);
    expect(isSqlPayload(keyless(false))).toBe(true);
    expect(isSqlPayload(keyless(undefined))).toBe(true);
    expect(isSqlPayload(keyless('yes'))).toBe(false);
  });

  // The page sizes ride in the payload so the control and the guard that accepts one read the same
  // list, which is only safe while the list itself is sound.
  it('rejects a payload whose page sizes are missing, empty, or not numbers', () => {
    expect(isSqlPayload(payload({ pageSizes: [] }))).toBe(false);
    expect(isSqlPayload(payload({ pageSizes: ['100'] as never }))).toBe(false);
    expect(isSqlPayload(payload({ pageSizes: undefined as never }))).toBe(false);
  });

  it('publishes only sizes the intent guard would accept', () => {
    for (const size of PAGE_SIZES) {
      expect(isSetPageSizeIntent({ limit: size })).toBe(true);
      expect(isSqlPayload(payload({ pageSizes: [size] }))).toBe(true);
    }
    expect(isSetPageSizeIntent({ limit: 999 })).toBe(false);
  });
});

describe('intent payload guards', () => {
  it('accepts a database name the registry would accept and refuses the rest', () => {
    expect(isOpenIntent({ name: 'shop_2-x' })).toBe(true);
    expect(isOpenIntent({ name: '../evil' })).toBe(false);
    expect(isOpenIntent({ name: 'a/b' })).toBe(false);
    expect(isOpenIntent({ name: '' })).toBe(false);
    expect(isOpenIntent({})).toBe(false);
  });

  it('accepts a selection with or without a filter, and refuses half a filter', () => {
    expect(isSelectObjectIntent({ object: 'customers' })).toBe(true);
    expect(isSelectObjectIntent({ object: 'customers', column: 'id', value: '1' })).toBe(true);
    expect(isSelectObjectIntent({ object: 'customers', column: 'id' })).toBe(false);
    expect(isSelectObjectIntent({ object: 'customers', value: '1' })).toBe(false);
    expect(isSelectObjectIntent({ object: 'customers', column: 'id', value: 1 })).toBe(false);
    expect(isSelectObjectIntent({})).toBe(false);
  });

  it('accepts a filter with a value and one without for a null test', () => {
    expect(isSetFilterIntent({ column: 'status', op: 'eq', value: 'paid' })).toBe(true);
    expect(isSetFilterIntent({ column: 'status', op: 'isNull' })).toBe(true);
    expect(isSetFilterIntent({ column: 'status', op: 'eq' })).toBe(false);
    expect(isSetFilterIntent({ column: 'status', op: 'nope', value: 'x' })).toBe(false);
  });

  it('accepts a parked filter naming a column and a state, and refuses either alone', () => {
    expect(isSetFilterEnabledIntent({ column: 'status', enabled: false })).toBe(true);
    expect(isSetFilterEnabledIntent({ column: 'status', enabled: true })).toBe(true);
    expect(isSetFilterEnabledIntent({ column: 'status' })).toBe(false);
    expect(isSetFilterEnabledIntent({ enabled: true })).toBe(false);
    expect(isSetFilterEnabledIntent({ column: 7, enabled: true })).toBe(false);
  });

  it('accepts a global term of any text, including an empty one that means none', () => {
    expect(isSetGlobalFilterIntent({ value: 'ada' })).toBe(true);
    expect(isSetGlobalFilterIntent({ value: '' })).toBe(true);
    expect(isSetGlobalFilterIntent({ value: "x'; DROP TABLE orders; --" })).toBe(true);
    expect(isSetGlobalFilterIntent({ value: 7 })).toBe(false);
    expect(isSetGlobalFilterIntent({})).toBe(false);
  });

  it('accepts a whole hidden set of column names, and refuses anything else', () => {
    expect(isSetColumnsIntent({ hidden: [] })).toBe(true);
    expect(isSetColumnsIntent({ hidden: ['a', 'b'] })).toBe(true);
    expect(isSetColumnsIntent({ hidden: 'a' })).toBe(false);
    expect(isSetColumnsIntent({ hidden: [1] })).toBe(false);
    expect(isSetColumnsIntent({})).toBe(false);
  });

  it('rejects a payload whose hidden set is not a list of names', () => {
    expect(isSqlPayload({ ...payload(), hidden: 'status' })).toBe(false);
    expect(isSqlPayload({ ...payload(), hidden: [1] })).toBe(false);
    expect(isSqlPayload({ ...payload(), hidden: [] })).toBe(true);
  });

  it('accepts a whole log of statements, and refuses a malformed entry', () => {
    expect(isSqlPayload({ ...payload(), log: [{ sql: 'UPDATE t', changed: 1 }] })).toBe(true);
    expect(isSqlPayload({ ...payload(), log: [{ sql: 'UPDATE t', changed: 1, error: 'no such table' }] })).toBe(true);
    expect(isSqlPayload({ ...payload(), log: [{ sql: 7, changed: 1 }] })).toBe(false);
    expect(isSqlPayload({ ...payload(), log: { sql: 'x', changed: 0 } })).toBe(false);
  });

  it('previews the insert it would run, with every value a placeholder', () => {
    const columns: SqlColumn[] = [
      { name: 'id', type: 'INTEGER', notNull: false, pk: 1 },
      { name: 'customer', type: 'TEXT', notNull: true, pk: 0 },
    ];
    expect(insertStatement('orders', [{ column: 'customer', value: 'ada' }], columns))
      .toBe('INSERT INTO "orders" ("customer") VALUES (?)');
  });

  it('previews a whole row in the order the object declares its columns, not the order typed', () => {
    const columns: SqlColumn[] = [
      { name: 'id', type: 'INTEGER', notNull: false, pk: 1 },
      { name: 'status', type: 'TEXT', notNull: false, pk: 0 },
    ];
    expect(insertStatement('orders', [{ column: 'status', value: 'paid' }, { column: 'id', value: '7' }], columns))
      .toBe('INSERT INTO "orders" ("id", "status") VALUES (?, ?)');
  });

  it('previews a null as a placeholder, because that is what the write binds', () => {
    const columns: SqlColumn[] = [{ name: 'note', type: 'TEXT', notNull: false, pk: 0 }];
    expect(insertStatement('orders', [{ column: 'note', value: null }], columns))
      .toBe('INSERT INTO "orders" ("note") VALUES (?)');
  });

  it('doubles an interior quote in a name, as every statement here does', () => {
    const columns: SqlColumn[] = [{ name: 'we"ird', type: 'TEXT', notNull: false, pk: 0 }];
    expect(insertStatement('ta"ble', [{ column: 'we"ird', value: 'x' }], columns))
      .toBe('INSERT INTO "ta""ble" ("we""ird") VALUES (?)');
  });

  it('previews nothing for a cell naming a column the object does not have', () => {
    // The write layer refuses such a cell, so showing it in a preview would be showing something
    // that cannot happen.
    const columns: SqlColumn[] = [{ name: 'id', type: 'INTEGER', notNull: false, pk: 1 }];
    expect(insertStatement('orders', [{ column: 'nope', value: 'x' }], columns))
      .toBe('INSERT INTO "orders" () VALUES ()');
  });

  it('accepts a page offset and a page size the grid offers', () => {
    expect(isSetPageIntent({ offset: 0 })).toBe(true);
    expect(isSetPageIntent({ offset: -1 })).toBe(false);
    expect(isSetPageIntent({ offset: 1.5 })).toBe(false);
    expect(isSetPageSizeIntent({ limit: 50 })).toBe(true);
    expect(isSetPageSizeIntent({ limit: 500 })).toBe(true);
    expect(isSetPageSizeIntent({ limit: 999 })).toBe(false);
  });

  it('accepts a cell value that is text, and one that is null', () => {
    expect(isUpdateCellIntent({ row: 'r1', column: 'a', value: 'x' })).toBe(true);
    expect(isUpdateCellIntent({ row: 'r1', column: 'a', value: null })).toBe(true);
    expect(isUpdateCellIntent({ row: 'r1', column: 'a', value: 7 })).toBe(false);
    expect(isUpdateCellIntent({ row: 'r1', column: 'a' })).toBe(false);
  });

  it('accepts an insert whose cells all name a column and a value or a null', () => {
    expect(isInsertRowIntent({ object: 'orders', cells: [{ column: 'a', value: null }] })).toBe(true);
    expect(isInsertRowIntent({ object: 'orders', cells: [{ column: 'a' }] })).toBe(false);
  });

  it('accepts either export format and refuses anything else', () => {
    expect(isExportIntent({ format: 'csv' })).toBe(true);
    expect(isExportIntent({ format: 'json' })).toBe(true);
    expect(isExportIntent({ format: 'xlsx' })).toBe(false);
  });
});
