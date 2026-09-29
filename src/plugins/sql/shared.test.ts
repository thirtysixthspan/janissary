import { describe, expect, it } from 'vitest';
import { isSqlPayload, type SqlPayload } from './shared.js';
import {
  isExportIntent,
  isInsertRowIntent,
  isOpenIntent,
  isSetFilterIntent,
  isSetPageIntent,
  isSetPageSizeIntent,
  isUpdateCellIntent,
} from './shared-intents.js';

function payload(over: Partial<SqlPayload> = {}): SqlPayload {
  return {
    database: 'shop',
    databases: [{ name: 'shop', exists: true, open: true }],
    objects: [{ name: 'orders', kind: 'table', writable: true, columns: [{ name: 'id', type: 'INTEGER', notNull: false, pk: 1 }] }],
    object: 'orders',
    filters: [],
    order: [],
    limit: 100,
    offset: 0,
    grid: null,
    stats: null,
    console: null,
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

  it('accepts a populated grid, stats, console, exports, error, and pending', () => {
    expect(isSqlPayload(payload({
      grid: {
        sql: 'SELECT 1', parameters: [1], columns: ['a'],
        rows: [{ key: 'r1', cells: [{ text: 'x', isNull: false }] }],
        total: 1, unfilteredTotal: 4, offset: 0, limit: 100, order: [{ column: 'a', desc: false }],
      },
      stats: [{ name: 'a', type: 'TEXT', nulls: 0, distinct: 1, total: 4, values: [{ label: 'x', count: 4 }] }],
      console: { sql: 'UPDATE t', changed: 1 },
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
});

describe('intent payload guards', () => {
  it('accepts a database name the registry would accept and refuses the rest', () => {
    expect(isOpenIntent({ name: 'shop_2-x' })).toBe(true);
    expect(isOpenIntent({ name: '../evil' })).toBe(false);
    expect(isOpenIntent({ name: 'a/b' })).toBe(false);
    expect(isOpenIntent({ name: '' })).toBe(false);
    expect(isOpenIntent({})).toBe(false);
  });

  it('accepts a filter with a value and one without for a null test', () => {
    expect(isSetFilterIntent({ column: 'status', op: 'eq', value: 'paid' })).toBe(true);
    expect(isSetFilterIntent({ column: 'status', op: 'isNull' })).toBe(true);
    expect(isSetFilterIntent({ column: 'status', op: 'eq' })).toBe(false);
    expect(isSetFilterIntent({ column: 'status', op: 'nope', value: 'x' })).toBe(false);
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
