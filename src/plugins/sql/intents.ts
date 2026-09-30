import {
  defineIntents,
  READ_QUERY,
  type TabPluginServerCapabilities,
} from '../api.js';
import { isSqlPayload, type SqlFilterOperator, type SqlPayload } from './shared.js';
import { selected, toggledOrder, withFilter, withFilterEnabled, withHidden } from './payload-changes.js';
import {
  isClearFiltersIntent,
  isClearLogIntent,
  isDeleteRowIntent,
  isExportIntent,
  isInsertRowIntent,
  isOpenIntent,
  isRefreshIntent,
  isRunIntent,
  isSelectObjectIntent,
  isSetColumnsIntent,
  isSetFilterEnabledIntent,
  isSetFilterIntent,
  isSetGlobalFilterIntent,
  isSetOrderIntent,
  isSetPageIntent,
  isSetPageSizeIntent,
  isUpdateCellIntent,
} from './shared-intents.js';
import type { SqlTabs } from './tabs.js';
import { newRequestId, planFor, planRequest, planRun, apply, reread } from './request.js';
import { openDatabase } from './open-tab.js';

// One client intent to one topic action, each behind the payload guard that decides whether the
// request is well formed. Every branch returns null — the answer arrives later on the topic — or
// throws through `rejectRequest`. Nothing here reports a failure: a filter the host will not accept
// is a user mistake, not a broken plugin.

/**
 * Refuse a write to something the view already calls read-only, and to a table the tab is not
 * showing. The host refuses a read-only write too, but its refusal arrives as an error band after a
 * round trip; this one is immediate and names the reason.
 *
 * `object` is the name the action is about to carry, which is not always the name the payload is
 * showing — `insert-row` takes a table name from the client, because a row key cannot name a row that
 * does not exist yet. Checking the action's own name against the payload's selection is what stops
 * that from being a way to write to a table the view never showed and never re-reads.
 */
function requireWritable(
  payload: SqlPayload,
  object: string,
  capabilities: TabPluginServerCapabilities,
  verb: string,
): void {
  if (object !== payload.object) capabilities.rejectRequest(`invalid insert-row object "${object}"`);
  const entry = payload.objects.find((candidate) => candidate.name === object);
  if (entry?.writable) return;
  const what = entry?.kind === 'view' ? 'A view' : 'This table';
  const why = entry?.kind === 'view' ? 'it is a view' : 'it has no primary key';
  capabilities.rejectRequest(`${what} cannot be ${verb}: ${why}.`);
}

export function intentsFor(tabs: SqlTabs) {
  return defineIntents('sql', isSqlPayload, {
    // The tab's own switcher sends this, for a database the registry has. One it has not is refused
    // exactly as the command refuses one, and for the same reason: reading a schema opens a
    // connection, so a name that is a typo would create a database nobody asked for.
    open: {
      payload: isOpenIntent,
      run: (_payload, value: { name: string }, capabilities): null => {
        openDatabase(value.name, undefined, capabilities, tabs);
        return null;
      },
    },
    'select-object': {
      payload: isSelectObjectIntent,
      run: (payload, value: { object: string; column?: string; value?: string }, capabilities): null => {
        // A filter carried with the selection is applied before the query is issued, so the action
        // is built from the state the tab will hold — see SelectObjectIntent.
        return apply(
          reread({ ...selected(payload, value), object: value.object, error: null }),
          capabilities,
          tabs,
        );
      },
    },
    'set-filter': {
      payload: isSetFilterIntent,
      run: (payload, value: { column: string; op: SqlFilterOperator; value?: string }, capabilities): null => {
        return apply(
          reread({ ...payload, filters: withFilter(payload, value.column, value.op, value.value) }),
          capabilities,
          tabs,
        );
      },
    },
    'set-filter-enabled': {
      payload: isSetFilterEnabledIntent,
      run: (payload, value: { column: string; enabled: boolean }, capabilities): null => {
        return apply(
          reread(withFilterEnabled(payload, value.column, value.enabled)),
          capabilities,
          tabs,
        );
      },
    },
    'clear-filters': {
      payload: isClearFiltersIntent,
      run: (payload, _value: Record<string, never>, capabilities): null => {
        // The global term goes with them: it is another thing narrowing the view, and leaving it
        // behind would make "Clear filters" clear only half of what the user can see.
        return apply(reread({ ...payload, filters: [], global: '' }), capabilities, tabs);
      },
    },
    'clear-log': {
      payload: isClearLogIntent,
      run: (payload, _value: Record<string, never>, capabilities): null => {
        // No re-read: a log is a record of what already ran, so clearing it changes nothing about
        // what the grid shows and the rows on screen are still the ones that were fetched.
        return apply({ payload: { ...payload, log: [] } }, capabilities, tabs);
      },
    },
    'set-columns': {
      payload: isSetColumnsIntent,
      run: (payload, value: { hidden: string[] }, capabilities): null => {
        return apply(reread(withHidden(payload, value.hidden)), capabilities, tabs);
      },
    },
    'set-global-filter': {
      payload: isSetGlobalFilterIntent,
      run: (payload, value: { value: string }, capabilities): null => {
        return apply(reread({ ...payload, global: value.value }), capabilities, tabs);
      },
    },
    'set-order': {
      payload: isSetOrderIntent,
      run: (payload, value: { column: string }, capabilities): null => {
        return apply(reread({ ...payload, order: toggledOrder(payload, value.column) }), capabilities, tabs);
      },
    },
    'set-page': {
      payload: isSetPageIntent,
      run: (payload, value: { offset: number }, capabilities): null => {
        // A page change is the one re-read that keeps its offset: the pager is asking for that page,
        // not for the first one again.
        const next = { ...payload, offset: value.offset };
        return apply({ payload: next, request: planRequest('query', next) }, capabilities, tabs);
      },
    },
    'set-page-size': {
      payload: isSetPageSizeIntent,
      run: (payload, value: { limit: number }, capabilities): null => {
        return apply(reread({ ...payload, limit: value.limit }), capabilities, tabs);
      },
    },
    refresh: {
      payload: isRefreshIntent,
      run: (payload, _value: Record<string, never>, capabilities): null => {
        return apply({ payload, request: planRequest('schema', payload) }, capabilities, tabs);
      },
    },
    run: {
      payload: isRunIntent,
      run: (payload, value: { sql: string }, capabilities): null => {
        // The same read/write split `db sqlite query` uses, from the same constant, so the console
        // and the command bar cannot disagree about what counts as a read.
        const next = { ...payload, error: null };
        return apply(
          { payload: next, request: planRun(next, value.sql, READ_QUERY.test(value.sql)) },
          capabilities,
          tabs,
        );
      },
    },
    'update-cell': {
      payload: isUpdateCellIntent,
      run: (payload, value: { row: string; column: string; value: string | null }, capabilities): null => {
        requireWritable(payload, payload.object, capabilities, 'edited');
        const request = planFor({
          topic: 'databases', action: 'updateCell', database: payload.database,
          requestId: newRequestId(), row: value.row, column: value.column, value: value.value,
        });
        return apply({ payload, request }, capabilities, tabs);
      },
    },
    'insert-row': {
      payload: isInsertRowIntent,
      run: (payload, value: { object: string; cells: { column: string; value: string | null }[] }, capabilities): null => {
        requireWritable(payload, value.object, capabilities, 'added to');
        const request = planFor({
          topic: 'databases', action: 'insertRow', database: payload.database,
          requestId: newRequestId(), object: value.object, cells: value.cells,
        });
        return apply({ payload, request }, capabilities, tabs);
      },
    },
    'delete-row': {
      payload: isDeleteRowIntent,
      run: (payload, value: { row: string }, capabilities): null => {
        requireWritable(payload, payload.object, capabilities, 'deleted from');
        const request = planFor({
          topic: 'databases', action: 'deleteRow', database: payload.database,
          requestId: newRequestId(), row: value.row,
        });
        return apply({ payload, request }, capabilities, tabs);
      },
    },
    export: {
      payload: isExportIntent,
      run: (payload, value: { format: 'csv' | 'json' }, capabilities): null => {
        const request = planRequest('export', payload, { format: value.format });
        return apply({ payload, request }, capabilities, tabs);
      },
    },
  });
}
