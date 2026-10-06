import { useMemo } from 'react';
import type { SqlFilterOperator, SqlInsertCell } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';

type SqlReferenceSelection = { object: string; column: string; value: string };

export type SqlActions = {
  open(name: string): void;
  selectObject(selection: string | SqlReferenceSelection): void;
  export(format: 'csv' | 'json'): void;
  run(sql: string): void;
  setColumns(hidden: string[]): void;
  insertRow(object: string, cells: SqlInsertCell[]): void;
  setOrder(column: string): void;
  updateCell(row: string, column: string, value: string | null): void;
  deleteRow(row: string): void;
  setPage(offset: number): void;
  setPageSize(limit: number): void;
  refresh(): void;
  setFilter(column: string, op: SqlFilterOperator, value?: string): void;
  setFilterEnabled(column: string, enabled: boolean): void;
  setGlobalFilter(value: string): void;
  clearFilters(): void;
};

type Intent = TabPluginClientCapabilities['intent'];

export function createSqlActions(intent: Intent): SqlActions {
  const send = (name: string, payload: unknown) => { void intent(name, payload); };

  return {
    open: (name) => send('open', { name }),
    selectObject: (selection) => send('select-object', typeof selection === 'string' ? { object: selection } : selection),
    export: (format) => send('export', { format }),
    run: (sql) => send('run', { sql }),
    setColumns: (hidden) => send('set-columns', { hidden }),
    insertRow: (object, cells) => send('insert-row', { object, cells }),
    setOrder: (column) => send('set-order', { column }),
    updateCell: (row, column, value) => send('update-cell', { row, column, value }),
    deleteRow: (row) => send('delete-row', { row }),
    setPage: (offset) => send('set-page', { offset }),
    setPageSize: (limit) => send('set-page-size', { limit }),
    refresh: () => send('refresh', {}),
    setFilter: (column, op, value) => send('set-filter', value === undefined ? { column, op } : { column, op, value }),
    setFilterEnabled: (column, enabled) => send('set-filter-enabled', { column, enabled }),
    setGlobalFilter: (value) => send('set-global-filter', { value }),
    clearFilters: () => send('clear-filters', {}),
  };
}

export function useSqlActions(capabilities: TabPluginClientCapabilities): SqlActions {
  return useMemo(() => createSqlActions(capabilities.intent), [capabilities.intent]);
}
