import type { SqlObject, SqlPayload, SqlRow } from '@shared/plugins/sql/shared';
import { vi } from 'vitest';
import type { TabPluginClientCapabilities } from '../api';

export const ORDERS: SqlObject = {
  name: 'orders', kind: 'table', writable: true,
  columns: [
    { name: 'id', type: 'INTEGER', notNull: false, pk: 1 },
    { name: 'status', type: 'TEXT', notNull: false, pk: 0 },
  ],
};

export const PAID: SqlObject = {
  name: 'paid', kind: 'view', writable: false,
  columns: [{ name: 'id', type: 'INTEGER', notNull: false, pk: 1 }],
};

/** `orders.customer_id` pointing at `customers.id`, as `PRAGMA foreign_key_list` reports it. */
export const CUSTOMERS: SqlObject = {
  name: 'customers', kind: 'table', writable: true,
  columns: [
    { name: 'id', type: 'INTEGER', notNull: false, pk: 1 },
    { name: 'name', type: 'TEXT', notNull: true, pk: 0 },
  ],
};

export const KEYED: SqlObject = {
  name: 'invoices', kind: 'table', writable: true,
  columns: [
    { name: 'id', type: 'INTEGER', notNull: false, pk: 1 },
    { name: 'customer_id', type: 'INTEGER', notNull: false, pk: 0, references: { table: 'customers', columns: ['id'] } },
  ],
};

export const ROWS: SqlRow[] = [
  { key: 'r1', cells: [{ text: '1', isNull: false }, { text: 'paid', isNull: false }] },
  { key: 'r2', cells: [{ text: '2', isNull: false }, { text: '', isNull: true }] },
];

export function grid(over: Partial<NonNullable<SqlPayload['grid']>> = {}) {
  return {
    sql: 'SELECT "id", "status" FROM "orders" ORDER BY "id" ASC LIMIT ? OFFSET ?',
    parameters: [100, 0],
    columns: ['id', 'status'],
    rows: ROWS,
    total: 200,
    unfilteredTotal: 200,
    offset: 0,
    limit: 100,
    order: [{ column: 'id', desc: false }],
    ...over,
  };
}

export function payload(over: Partial<SqlPayload> = {}): SqlPayload {
  return {
    database: 'shop',
    databases: [{ name: 'shop', exists: true, open: true }],
    objects: [ORDERS, PAID],
    object: 'orders',
    filters: [],
    order: [],
    limit: 100,
    offset: 0,
    pageSizes: [50, 100, 500],
    grid: grid(),
    stats: null,
    console: null,
    exports: [],
    error: null,
    pending: null,
    ...over,
  };
}

export function makeCapabilities(dock: 'left' | 'right' | null = null) {
  const intent = vi.fn<(name: string, body: unknown) => Promise<unknown>>(async () => null);
  const capabilities: TabPluginClientCapabilities = {
    resourceUrl: (reference) => `${reference}?token=test`,
    intent: async <Result,>(name: string, body: unknown) => intent(name, body) as Promise<Result>,
    splitAction: null,
    active: true,
    dock,
    close: vi.fn(),
    reportFailure: vi.fn(),
  };
  return { capabilities, intent };
}
