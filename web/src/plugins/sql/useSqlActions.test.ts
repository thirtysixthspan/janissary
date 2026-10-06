import { describe, expect, it, vi } from 'vitest';
import { createSqlActions } from './useSqlActions';

describe('createSqlActions', () => {
  it('maps named operations to their SQL intent names and payloads', () => {
    const intent = vi.fn<(name: string, payload: unknown) => Promise<unknown>>(async () => null);
    const actions = createSqlActions(async <Result,>(name: string, payload: unknown) => (
      intent(name, payload) as Promise<Result>
    ));

    actions.open('shop');
    actions.selectObject('orders');
    actions.selectObject({ object: 'customers', column: 'id', value: '1' });
    actions.export('csv');
    actions.run('SELECT 1');
    actions.setColumns(['status']);
    actions.insertRow('orders', [{ column: 'status', value: 'paid' }]);
    actions.setOrder('id');
    actions.updateCell('r1', 'status', null);
    actions.deleteRow('r1');
    actions.setPage(100);
    actions.setPageSize(50);
    actions.refresh();
    actions.setFilter('status', 'eq', 'paid');
    actions.setFilter('status', 'isNull');
    actions.setFilterEnabled('status', false);
    actions.setGlobalFilter('paid');
    actions.clearFilters();

    expect(intent.mock.calls).toEqual([
      ['open', { name: 'shop' }],
      ['select-object', { object: 'orders' }],
      ['select-object', { object: 'customers', column: 'id', value: '1' }],
      ['export', { format: 'csv' }],
      ['run', { sql: 'SELECT 1' }],
      ['set-columns', { hidden: ['status'] }],
      ['insert-row', { object: 'orders', cells: [{ column: 'status', value: 'paid' }] }],
      ['set-order', { column: 'id' }],
      ['update-cell', { row: 'r1', column: 'status', value: null }],
      ['delete-row', { row: 'r1' }],
      ['set-page', { offset: 100 }],
      ['set-page-size', { limit: 50 }],
      ['refresh', {}],
      ['set-filter', { column: 'status', op: 'eq', value: 'paid' }],
      ['set-filter', { column: 'status', op: 'isNull' }],
      ['set-filter-enabled', { column: 'status', enabled: false }],
      ['set-global-filter', { value: 'paid' }],
      ['clear-filters', {}],
    ]);
  });
});
