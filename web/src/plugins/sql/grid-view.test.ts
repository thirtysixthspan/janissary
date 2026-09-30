import { describe, expect, it } from 'vitest';
import type { SqlGrid, SqlObject, SqlPayload } from '@shared/plugins/sql/shared';
import {
  browsable,
  cellText,
  columnCount,
  countLabel,
  filterLabel,
  groupedObjects,
  hasNext,
  hasPrevious,
  nextOffset,
  pageLabel,
  previousOffset,
  readOnlyReason,
  rowRange,
  statementResult,
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

  // A console result the ceiling cut off reports the rows it holds, not a total — a total here is
  // exactly the claim that makes a cut-off read look like a small one.
  it('says a result the console cut off is the first of more, and names no total', () => {
    const cut = grid({ rows: Array.from({ length: 200 }, () => GRID.rows[0]), total: 200, unfilteredTotal: 200, limit: 200 });
    expect(pageLabel({ ...cut, truncated: true })).toBe('First 200 rows of more than 200.');
    expect(pageLabel(cut)).toBe('Rows 1–200 of 200 rows');
  });
});

describe('countLabel', () => {
  function payload(over: Partial<SqlPayload> = {}): SqlPayload {
    return {
      database: 'shop',
      databases: [{ name: 'shop', exists: true, open: true }],
      objects: [ORDERS],
      object: 'orders',
      filters: [],
      hidden: [],
      global: '',
      order: [],
      limit: 100,
      offset: 0,
      pageSizes: [50, 100, 500],
      grid: GRID,
      exports: [],
      error: null,
      pending: null,
      ...over,
    };
  }

  it('reads the range line once a page has arrived', () => {
    expect(countLabel(payload())).toBe(pageLabel(GRID));
  });

  it('reads as loading while a request is still outstanding', () => {
    expect(countLabel(payload({ grid: null, pending: { id: 'r1', followUp: 'query' } }))).toBe('Loading…');
  });

  it('reads as an empty database once the schema read has landed with nothing in it', () => {
    expect(countLabel(payload({ objects: [], object: '', grid: null }))).toBe('No tables.');
  });

  // A tab that has just opened holds an empty object list too, so the two states differ only by
  // whether anything is still outstanding — and the one still outstanding is the one to read.
  it('reads as loading on a tab whose first read has not answered yet', () => {
    expect(countLabel(payload({
      objects: [], object: '', grid: null, pending: { id: 'r1', followUp: 'schema' },
    }))).toBe('Loading…');
  });

  it('still reads as loading when a refused query left no page and no request', () => {
    expect(countLabel(payload({ grid: null }))).toBe('Loading…');
  });

  // The tab shows no failures, so a database deleted under it would otherwise read as loading for good.
  it('says why there is no page when a failure left nothing to show', () => {
    const error = 'Database "shop" does not exist. Create it to start.';
    expect(countLabel(payload({ grid: null, error }))).toBe(error);
    expect(countLabel(payload({ grid: null, objects: [], object: '', error }))).toBe(error);
  });

  it('reads as loading rather than the old failure while a request is outstanding', () => {
    expect(countLabel(payload({
      grid: null, error: 'Query error: no such table', pending: { id: 'r1', followUp: 'schema' },
    }))).toBe('Loading…');
  });

  it('reads the range line, not a failure, while the page it had is still there', () => {
    expect(countLabel(payload({ error: 'Query error: no such column: nope' }))).toBe(pageLabel(GRID));
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

// A run of whole rows: extending it keeps the row the run started from and reaches the row it was
// taken to, and a run has no direction.
describe('rowRange', () => {
  it('is that row alone when there is no run to extend', () => {
    expect(rowRange(1, null)).toEqual({ from: 1, to: 1 });
  });

  it('extends a run in progress from the row it started at', () => {
    expect(rowRange(2, { from: 0, to: 0 })).toEqual({ from: 0, to: 2 });
  });

  it('reaches the same rows whichever way the run was taken', () => {
    expect(rowRange(0, { from: 2, to: 2 })).toEqual({ from: 0, to: 2 });
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

  // A statement's result sits over whatever object the tab had selected, and a writable one is
  // exactly the case where the object has nothing to say — the result is what cannot be written.
  it('names a statement result for a writable object, and for no object at all', () => {
    expect(readOnlyReason(ORDERS, true)).toBe("Read-only: this is a statement's result, not a table.");
    expect(readOnlyReason(undefined, true)).toBe("Read-only: this is a statement's result, not a table.");
  });
});

describe('statementResult', () => {
  it('is true only for a grid the server says carries no row identity', () => {
    expect(statementResult(grid({ keyless: true }))).toBe(true);
    expect(statementResult(grid())).toBe(false);
    expect(statementResult(null)).toBe(false);
  });

  it('says a result that returned no rows is still a statement result', () => {
    // The rows are what a key is, so an empty one gives a client nothing to go on — the server's
    // own word is what keeps a read that matched nothing from being treated as a writable page.
    expect(statementResult(grid({ rows: [], total: 0, unfilteredTotal: 0, keyless: true }))).toBe(true);
  });
});

describe('columnCount', () => {
  it('uses the singular for one column', () => {
    expect(columnCount(ORDERS)).toBe('1 col');
    expect(columnCount({ ...ORDERS, columns: [...ORDERS.columns, { name: 'b', type: 'TEXT', notNull: false, pk: 0 }] }))
      .toBe('2 cols');
  });
});

describe('SqlPayload shape used by the view', () => {
  it('carries everything the grid renders without reaching for anything else', () => {
    const payload: SqlPayload = {
      database: 'shop', databases: [{ name: 'shop', exists: true, open: true }],
      objects: [ORDERS], object: 'orders', filters: [], hidden: [], global: '', order: [], limit: 100, offset: 0,
      pageSizes: [50, 100, 500],
      grid: GRID, exports: [], error: null, pending: null,
    };
    expect(payload.grid?.columns).toEqual(['a']);
  });
});
