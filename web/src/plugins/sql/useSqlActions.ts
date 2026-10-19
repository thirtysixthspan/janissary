import { useMemo } from 'react';
import { errorText } from '@shared/error-text';
import type { SqlFilterOperator, SqlInsertCell } from '@shared/plugins/sql/shared';
import type { TabPluginClientCapabilities } from '../api';

type SqlReferenceSelection = { object: string; column: string; value: string };

export type SqlActions = {
  open(name: string): void;
  selectObject(selection: string | SqlReferenceSelection): void;
  export(format: 'csv' | 'json'): void;
  run(sql: string): Promise<boolean>;
  setColumns(hidden: string[]): void;
  insertRow(object: string, cells: SqlInsertCell[]): Promise<boolean>;
  setOrder(column: string): void;
  updateCell(row: string, column: string, value: string | null): Promise<boolean>;
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

export function createSqlActions(intent: Intent, onRequestError: (reason: string) => void = () => {}): SqlActions {
  const send = async (name: string, payload: unknown): Promise<boolean> => {
    try {
      await intent(name, payload);
      return true;
    } catch (error) {
      onRequestError(errorText(error) || String(error));
      return false;
    }
  };
  const dispatch = (name: string, payload: unknown): void => { void send(name, payload); };

  return {
    open: (name) => dispatch('open', { name }),
    selectObject: (selection) => dispatch('select-object', typeof selection === 'string' ? { object: selection } : selection),
    export: (format) => dispatch('export', { format }),
    run: (sql) => send('run', { sql }),
    setColumns: (hidden) => dispatch('set-columns', { hidden }),
    insertRow: (object, cells) => send('insert-row', { object, cells }),
    setOrder: (column) => dispatch('set-order', { column }),
    updateCell: (row, column, value) => send('update-cell', { row, column, value }),
    deleteRow: (row) => dispatch('delete-row', { row }),
    setPage: (offset) => dispatch('set-page', { offset }),
    setPageSize: (limit) => dispatch('set-page-size', { limit }),
    refresh: () => dispatch('refresh', {}),
    setFilter: (column, op, value) => dispatch('set-filter', value === undefined ? { column, op } : { column, op, value }),
    setFilterEnabled: (column, enabled) => dispatch('set-filter-enabled', { column, enabled }),
    setGlobalFilter: (value) => dispatch('set-global-filter', { value }),
    clearFilters: () => dispatch('clear-filters', {}),
  };
}

export function useSqlActions(
  capabilities: TabPluginClientCapabilities, onRequestError: (reason: string) => void = () => {},
): SqlActions {
  return useMemo(() => createSqlActions(capabilities.intent, onRequestError), [capabilities.intent, onRequestError]);
}
