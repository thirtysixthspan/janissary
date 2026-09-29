import { describe, expect, it } from 'vitest';
import type { SqlGrid, SqlObject, SqlPayload, SqlStatsColumn } from '@shared/plugins/sql/shared';
import {
  barScale,
  browsable,
  cellText,
  columnCount,
  filterLabel,
  groupedObjects,
  hasNext,
  hasPrevious,
  goToRow,
  nextOffset,
  pageLabel,
  previousOffset,
  readOnlyReason,
  renderRunnableSql,
} from './grid-view';

const GRID: SqlGrid = {
  sql: 'SELECT "a" FROM "t" ORDER BY "a" ASC LIMIT ? OFFSET ?',
  parameters: [100, 0],
  columns: ['a'],
  rows: [
    { key: 'r1', cells: [{ text: '1', isNull: false }] },
    { key: 'r2', cells: [{ text: '2', isNull: false }] },
  ],
  total: 4213,
  unfilteredTotal: 4213,
  offset: 0,
  limit: 100,
  order: [{ column: 'a', desc: false }],
};

function grid(over: Partial<SqlGrid> = {}): SqlGrid {
  return { ...GRID, ...over };
}

const ORDERS: SqlObject = {
  name: 'orders', kind: 'table', writable: true,
  columns: [{ name: 'id', type: 'INTEGER', notNull: false, pk: 1 }],
};
const LOGS: SqlObject = { name: 'logs', kind: 'table', writable: false, columns: [] };
const PAID: SqlObject = { name: 'paid', kind: 'view', writable: false, columns: [] };
const INDEX: SqlObject = { name: 'i', kind: 'index', writable: false, columns: [] };
const TRIGGER: SqlObject = { name: 't', kind: 'trigger', writable: false, columns: [] };

describe('pageLabel', () => {
  it('reads a first page against the object total', () => {
    expect(pageLabel(grid({ rows: GRID.rows.slice(0, 1) }))).toBe('Rows 1–1 of 4,213 rows');
  });

  it('reads a middle page', () => {
    expect(pageLabel(grid({ offset: 100 }))).toBe('Rows 101–102 of 4,213 rows');
  });

  it('reads a last partial page', () => {
    expect(pageLabel(grid({ offset: 4212, total: 4213, rows: [GRID.rows[0]] })))
      .toBe('Rows 4,213–4,213 of 4,213 rows');
  });

  it('says how much of the table a filter narrowed', () => {
    expect(pageLabel(grid({ total: 3, unfilteredTotal: 51_882 })))
      .toBe('Rows 1–2 of 3 of 51,882 rows');
  });

  it('says there are no rows rather than reading an empty range', () => {
    expect(pageLabel(grid({ rows: [], total: 0, unfilteredTotal: 0 }))).toBe('No rows.');
  });

  it('uses the singular for one row', () => {
    expect(pageLabel(grid({ rows: GRID.rows.slice(0, 1), total: 1, unfilteredTotal: 1 }))).toBe('Rows 1–1 of 1 row');
  });
});

describe('pager arithmetic', () => {
  it('has no previous on the first page and no next on the last', () => {
    expect(hasPrevious(grid())).toBe(false);
    expect(hasNext(grid())).toBe(true);
    expect(hasPrevious(grid({ offset: 100 }))).toBe(true);
    expect(hasNext(grid({ offset: 4212, total: 4213, rows: [GRID.rows[0]] }))).toBe(false);
  });

  it('has neither without a grid at all', () => {
    expect(hasPrevious(null)).toBe(false);
    expect(hasNext(null)).toBe(false);
  });

  it('steps by a whole page and never below zero', () => {
    expect(nextOffset(grid({ offset: 100 }))).toBe(200);
    expect(previousOffset(grid({ offset: 100 }))).toBe(0);
    expect(previousOffset(grid({ offset: 0 }))).toBe(0);
    expect(previousOffset(null)).toBe(0);
  });
});

describe('goToRow', () => {
  const big = grid({ total: 51_882, limit: 100, offset: 0, unfilteredTotal: 51_882 });

  it('turns a row number into the page that starts it', () => {
    expect(goToRow('1', big)).toBe(0);
    expect(goToRow('100', big)).toBe(0);
    expect(goToRow('101', big)).toBe(100);
    expect(goToRow('40000', big)).toBe(39_900);
  });

  it('clamps past the end to the last page rather than past it', () => {
    // A row number the user got wrong should land them at the end and show them that, not show
    // nothing at all.
    expect(goToRow('99999', big)).toBe(51_800);
    expect(goToRow('51882', big)).toBe(51_800);
  });

  it('asks for no page when the number is not a whole row above zero', () => {
    expect(goToRow('', big)).toBeNull();
    expect(goToRow('0', big)).toBeNull();
    expect(goToRow('-5', big)).toBeNull();
    expect(goToRow('1.5', big)).toBeNull();
    expect(goToRow('abc', big)).toBeNull();
    expect(goToRow('twelve', big)).toBeNull();
  });

  it('lands on the first page for an empty object rather than nowhere', () => {
    expect(goToRow('5', grid({ total: 0, limit: 100, offset: 0 }))).toBe(0);
  });

  it('uses a page size other than the default', () => {
    expect(goToRow('120', grid({ total: 4213, limit: 50, offset: 0 }))).toBe(100);
  });
});

describe('filterLabel', () => {
  it('reads each operator as the comparison it makes', () => {
    expect(filterLabel({ column: 'status', op: 'eq', value: 'paid' })).toBe('status = paid');
    expect(filterLabel({ column: 'total', op: 'gte', value: '10' })).toBe('total ≥ 10');
    expect(filterLabel({ column: 'name', op: 'contains', value: 'ada' })).toBe('name contains ada');
    expect(filterLabel({ column: 'note', op: 'isNull' })).toBe('note is null');
    expect(filterLabel({ column: 'note', op: 'notNull' })).toBe('note is not null');
  });
});

describe('cellText', () => {
  it('shows a null and an empty string differently', () => {
    expect(cellText({ text: '', isNull: true })).toBe('NULL');
    expect(cellText({ text: '', isNull: false })).toBe('');
    expect(cellText({ text: 'x', isNull: false })).toBe('x');
  });
});

describe('groupedObjects', () => {
  it('lists tables before views, indexes, and triggers, and drops an empty group', () => {
    expect(groupedObjects([TRIGGER, INDEX, PAID, LOGS, ORDERS]).map((group) => group.label))
      .toEqual(['Tables', 'Views', 'Indexes', 'Triggers']);
    expect(groupedObjects([ORDERS]).map((group) => group.label)).toEqual(['Tables']);
    expect(groupedObjects([])).toEqual([]);
  });
});

describe('browsable', () => {
  it('is true for a table and a view, and false for an index and a trigger', () => {
    expect(browsable(ORDERS)).toBe(true);
    expect(browsable(PAID)).toBe(true);
    expect(browsable(INDEX)).toBe(false);
    expect(browsable(TRIGGER)).toBe(false);
  });
});

describe('readOnlyReason', () => {
  it('names a view as a view and a keyless table as one without a primary key', () => {
    expect(readOnlyReason(ORDERS)).toBeNull();
    expect(readOnlyReason(PAID)).toBe('Read-only: "paid" is a view.');
    expect(readOnlyReason(LOGS)).toBe('Read-only: "logs" has no primary key.');
    expect(readOnlyReason(undefined)).toBeNull();
  });
});

describe('columnCount', () => {
  it('uses the singular for one column', () => {
    expect(columnCount(ORDERS)).toBe('1 col');
    expect(columnCount({ ...ORDERS, columns: [...ORDERS.columns, { name: 'b', type: 'TEXT', notNull: false, pk: 0 }] }))
      .toBe('2 cols');
  });
});

describe('barScale', () => {
  const column = (values: { label: string; count: number }[]): SqlStatsColumn => ({
    name: 'a', type: 'TEXT', nulls: 0, distinct: values.length, total: 0, values,
  });

  it('is the largest count, so every bar scales against a real maximum', () => {
    expect(barScale(column([{ label: 'x', count: 4 }, { label: 'y', count: 17 }]))).toBe(17);
    expect(barScale(column([]))).toBe(0);
  });
});

describe('renderRunnableSql', () => {
  it('writes a text value as a quoted literal and a number bare', () => {
    expect(renderRunnableSql('SELECT * FROM t WHERE a = ? AND b > ?', ['paid', 10]))
      .toBe("SELECT * FROM t WHERE a = 'paid' AND b > 10");
  });

  it('doubles an interior quote rather than truncating the statement', () => {
    expect(renderRunnableSql('SELECT * FROM t WHERE a = ?', ["it's"]))
      .toBe("SELECT * FROM t WHERE a = 'it''s'");
  });

  it('leaves a statement with no placeholder alone', () => {
    expect(renderRunnableSql('SELECT 1', ['x'])).toBe('SELECT 1');
    expect(renderRunnableSql('SELECT 1', [])).toBe('SELECT 1');
  });

  it('degrades visibly when the counts do not match, rather than quietly guessing', () => {
    expect(renderRunnableSql('SELECT * FROM t WHERE a = ? AND b = ?', ['only-one']))
      .toBe("SELECT * FROM t WHERE a = 'only-one' AND b = ?");
    expect(renderRunnableSql('SELECT * FROM t WHERE a = ?', ['one', 'two']))
      .toBe("SELECT * FROM t WHERE a = 'one'");
  });
});

describe('SqlPayload shape used by the view', () => {
  it('carries everything the grid renders without reaching for anything else', () => {
    const payload: SqlPayload = {
      database: 'shop', databases: [{ name: 'shop', exists: true, open: true }],
      objects: [ORDERS], object: 'orders', filters: [], hidden: [], global: '', order: [], limit: 100, offset: 0,
      pageSizes: [50, 100, 500],
      grid: GRID, stats: null, log: [], exports: [], error: null, pending: null,
    };
    expect(payload.grid?.columns).toEqual(['a']);
  });
});
