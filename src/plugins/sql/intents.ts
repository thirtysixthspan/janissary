import {
  defineIntents,
  READ_QUERY,
  type TabPluginServerCapabilities,
} from '../api.js';
import { isSqlPayload, type SqlFilterOperator, type SqlPayload } from './shared.js';
import {
  isClearFiltersIntent,
  isDeleteRowIntent,
  isExportIntent,
  isInsertRowIntent,
  isOpenIntent,
  isRefreshIntent,
  isRunIntent,
  isSelectObjectIntent,
  isSetFilterIntent,
  isSetOrderIntent,
  isSetPageIntent,
  isSetPageSizeIntent,
  isStatsIntent,
  isUpdateCellIntent,
} from './shared-intents.js';
import { instanceKeyFor, issue, issueRun, newRequestId, type SqlTabs } from './tabs.js';
import { openDatabase } from './open-tab.js';

// One client intent to one topic action, each behind the payload guard that decides whether the
// request is well formed. Every branch returns null — the answer arrives later on the topic — or
// throws through `rejectRequest`. Nothing here reports a failure: a filter the host will not accept
// is a user mistake, not a broken plugin.

/**
 * A view change re-reads the same grid query from the first page, because an offset is page-relative.
 *
 * Every intent goes through here or through the same two-step shape beside it, and both build the
 * topic action from the payload the tab is about to hold — never from the one it already held. The
 * query the host runs and the state the tab records are then the same state by construction, which is
 * the only way a filter chip, a page number, and the rows on screen cannot disagree.
 */
function reread(payload: SqlPayload, capabilities: TabPluginServerCapabilities): SqlPayload {
  const next = { ...payload, offset: 0 };
  return { ...next, pending: issue('query', next, capabilities) };
}

function toggledOrder(payload: SqlPayload, column: string) {
  const existing = payload.order[0];
  if (existing?.column !== column) return [{ column, desc: false }];
  return existing.desc ? [] : [{ column, desc: true }];
}

// Replaces the filter on one column, or removes it when the same column is filtered the same way
// again. Toggling rather than stacking is what stops a grid accumulating an unbounded filter list as
// a user experiments.
function withFilter(payload: SqlPayload, column: string, op: SqlFilterOperator, value: string | undefined) {
  const same = payload.filters.find((filter) => filter.column === column);
  const identical = same?.op === op && same?.value === value;
  const next = op === 'isNull' || op === 'notNull' ? { column, op } : { column, op, value };
  return identical
    ? payload.filters.filter((filter) => filter.column !== column)
    : [...payload.filters.filter((filter) => filter.column !== column), next];
}

/**
 * Refuse a write to something the view already calls read-only. The host refuses it too, but the
 * host's refusal arrives as an error band after a round trip; this one is immediate and names the
 * reason, and it is what stops a hand-sent intent writing to a table the tab shows as read-only.
 */
function requireWritable(payload: SqlPayload, capabilities: TabPluginServerCapabilities, verb: string): void {
  const object = payload.objects.find((entry) => entry.name === payload.object);
  if (object?.writable) return;
  const what = object?.kind === 'view' ? 'A view' : 'This table';
  const why = object?.kind === 'view' ? 'it is a view' : 'it has no primary key';
  capabilities.rejectRequest(`${what} cannot be ${verb}: ${why}.`);
}

/** Record the new payload and redraw the tab it belongs to. The only way this plugin changes a tab. */
function apply(payload: SqlPayload, capabilities: TabPluginServerCapabilities, tabs: SqlTabs): null {
  const key = instanceKeyFor(payload.database);
  tabs.write(key, payload);
  capabilities.updateTab(key, () => ({ payload }));
  return null;
}

export function intentsFor(tabs: SqlTabs) {
  return defineIntents('sql', isSqlPayload, {
    // Opening a database that does not exist creates it, so the empty state's Create control and the
    // header's database switcher are the same intent with a different name.
    open: {
      payload: isOpenIntent,
      run: (_payload, value: { name: string }, capabilities): null => {
        openDatabase(value.name, undefined, capabilities, tabs);
        return null;
      },
    },
    'select-object': {
      payload: isSelectObjectIntent,
      run: (payload, value: { object: string }, capabilities): null => {
        return apply(
          reread({ ...payload, object: value.object, stats: null, error: null }, capabilities),
          capabilities,
          tabs,
        );
      },
    },
    'set-filter': {
      payload: isSetFilterIntent,
      run: (payload, value: { column: string; op: SqlFilterOperator; value?: string }, capabilities): null => {
        return apply(
          reread({ ...payload, filters: withFilter(payload, value.column, value.op, value.value) }, capabilities),
          capabilities,
          tabs,
        );
      },
    },
    'clear-filters': {
      payload: isClearFiltersIntent,
      run: (payload, _value: Record<string, never>, capabilities): null => {
        return apply(reread({ ...payload, filters: [] }, capabilities), capabilities, tabs);
      },
    },
    'set-order': {
      payload: isSetOrderIntent,
      run: (payload, value: { column: string }, capabilities): null => {
        return apply(
          reread({ ...payload, order: toggledOrder(payload, value.column) }, capabilities),
          capabilities,
          tabs,
        );
      },
    },
    'set-page': {
      payload: isSetPageIntent,
      run: (payload, value: { offset: number }, capabilities): null => {
        const next = { ...payload, offset: value.offset };
        return apply({ ...next, pending: issue('query', next, capabilities) }, capabilities, tabs);
      },
    },
    'set-page-size': {
      payload: isSetPageSizeIntent,
      run: (payload, value: { limit: number }, capabilities): null => {
        return apply(reread({ ...payload, limit: value.limit }, capabilities), capabilities, tabs);
      },
    },
    refresh: {
      payload: isRefreshIntent,
      run: (payload, _value: Record<string, never>, capabilities): null => {
        const next = { ...payload };
        return apply({ ...next, pending: issue('schema', next, capabilities) }, capabilities, tabs);
      },
    },
    run: {
      payload: isRunIntent,
      run: (payload, value: { sql: string }, capabilities): null => {
        // The same read/write split `db sqlite query` uses, from the same constant, so the console
        // and the command bar cannot disagree about what counts as a read.
        const next = { ...payload, error: null };
        return apply({ ...next, pending: issueRun(next, value.sql, READ_QUERY.test(value.sql), capabilities) }, capabilities, tabs);
      },
    },
    'update-cell': {
      payload: isUpdateCellIntent,
      run: (payload, value: { row: string; column: string; value: string | null }, capabilities): null => {
        requireWritable(payload, capabilities, 'edited');
        const id = newRequestId();
        capabilities.topicAction({
          topic: 'databases', action: 'updateCell', database: payload.database,
          requestId: id, row: value.row, column: value.column, value: value.value,
        });
        return apply({ ...payload, pending: { id, followUp: 'query' } }, capabilities, tabs);
      },
    },
    'insert-row': {
      payload: isInsertRowIntent,
      run: (payload, value: { object: string; cells: { column: string; value: string | null }[] }, capabilities): null => {
        requireWritable(payload, capabilities, 'added to');
        const id = newRequestId();
        capabilities.topicAction({
          topic: 'databases', action: 'insertRow', database: payload.database,
          requestId: id, object: value.object, cells: value.cells,
        });
        return apply({ ...payload, pending: { id, followUp: 'query' } }, capabilities, tabs);
      },
    },
    'delete-row': {
      payload: isDeleteRowIntent,
      run: (payload, value: { row: string }, capabilities): null => {
        requireWritable(payload, capabilities, 'deleted from');
        const id = newRequestId();
        capabilities.topicAction({
          topic: 'databases', action: 'deleteRow', database: payload.database, requestId: id, row: value.row,
        });
        return apply({ ...payload, pending: { id, followUp: 'query' } }, capabilities, tabs);
      },
    },
    stats: {
      payload: isStatsIntent,
      run: (payload, value: { object: string }, capabilities): null => {
        const next = { ...payload, object: value.object, stats: null };
        return apply({ ...next, pending: issue('stats', next, capabilities) }, capabilities, tabs);
      },
    },
    export: {
      payload: isExportIntent,
      run: (payload, value: { format: 'csv' | 'json' }, capabilities): null => {
        const next = { ...payload };
        return apply({ ...next, pending: issue('export', next, capabilities, { format: value.format }) }, capabilities, tabs);
      },
    },
  });
}
