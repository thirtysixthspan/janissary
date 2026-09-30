import { randomUUID } from 'node:crypto';
import type { TabPluginServerCapabilities, TabPluginTopicAction } from '../api.js';
import { isFilterOn, type SqlPayload, type SqlPending } from './shared.js';
import { instanceKeyFor, type SqlTabs } from './tabs.js';

// A request the plugin is about to make, and the topic action that will answer it. Kept together so
// the payload that records "I am waiting for this" and the action that is sent cannot drift apart.
export type SqlRequest = { pending: SqlPending; action: TabPluginTopicAction };

/** A tab's new state, and the request that state is waiting on once recorded. */
export type SqlChange = { payload: SqlPayload; request?: SqlRequest };

/**
 * A view change re-reads the same grid query from the first page, because an offset is page-relative.
 *
 * Every view intent goes through here or through the same two-step shape beside it, and both build the
 * topic action from the payload the tab is about to hold — never from the one it already held. The
 * query the host runs and the state the tab records are then the same state by construction, which is
 * the only way a filter chip, a page number, and the rows on screen cannot disagree.
 */
export function reread(payload: SqlPayload): SqlChange {
  const next = { ...payload, offset: 0 };
  return { payload: next, request: planRequest('query', next) };
}

/**
 * Record the new payload and redraw the tab it belongs to, then send the request it is waiting on.
 * The only way this plugin changes a tab. The send comes last and `dispatch` is what guarantees it,
 * so no intent can send a request the tab has not yet recorded as outstanding.
 */
export function apply(change: SqlChange, capabilities: TabPluginServerCapabilities, tabs: SqlTabs): null {
  const key = instanceKeyFor(change.payload.database);
  if (change.request) {
    dispatch(key, change.payload, change.request, capabilities, tabs, (payload) => {
      capabilities.updateTab(key, () => ({ payload }));
    });
    return null;
  }
  tabs.write(key, change.payload);
  capabilities.updateTab(key, () => ({ payload: change.payload }));
  return null;
}

/** A fresh request id, minted here because the host echoes one back rather than issuing it. */
export function newRequestId(): string {
  return randomUUID();
}

export function gridQueryOf(payload: SqlPayload) {
  return {
    object: payload.object,
    // Only the filters that are in force: a parked one is dropped here rather than taught to the
    // query builder, so the host never sees a filter the user is not asking for. Each one is built
    // by hand because `enabled` is view state, and view state does not travel to the host.
    filters: payload.filters.filter(isFilterOn).map((filter) => ({
      column: filter.column, op: filter.op, value: filter.value,
    })),
    global: payload.global,
    order: payload.order.map((entry) => ({ ...entry })),
    limit: payload.limit,
    offset: payload.offset,
  };
}

/**
 * Plan a read the tab will make once it has been told what to do with the answer. `then` is what
 * makes a follow-up part of the request rather than a guess in the notification: a schema read picks
 * an object, a write re-runs the grid.
 */
export function planRequest(
  action: 'schema' | 'query' | 'export',
  payload: SqlPayload,
  options: { format?: 'csv' | 'json' } = {},
): SqlRequest {
  const id = newRequestId();
  const pending: SqlPending = { id, followUp: action };
  const shared = { topic: 'databases', database: payload.database, requestId: id } as const;
  switch (action) {
    case 'schema': {
      return { pending, action: { ...shared, action } };
    }
    case 'query': {
      return { pending, action: { ...shared, action, query: gridQueryOf(payload) } };
    }
    case 'export': {
      return { pending, action: { ...shared, action, query: gridQueryOf(payload), format: options.format ?? 'csv' } };
    }
  }
}

/** The same, for a statement the user typed: its answer either fills the grid or is the console's. */
export function planRun(payload: SqlPayload, sql: string, returnsRows: boolean): SqlRequest {
  const id = newRequestId();
  return {
    pending: { id, followUp: returnsRows ? 'query' : 'console' },
    action: { topic: 'databases', action: 'run', database: payload.database, requestId: id, sql, returnsRows },
  };
}

/**
 * A grid write the plugin composes itself, carrying a row key or cell values and never SQL. Only the
 * database actions name a request id, so that is what this accepts — the caller mints the id and
 * hands the whole action over, and this pairs it with the follow-up the tab is waiting for.
 */
export function planFor(
  action: Extract<TabPluginTopicAction, { topic: 'databases' }>,
  followUp: SqlPending['followUp'] = 'query',
): SqlRequest {
  return { pending: { id: action.requestId, followUp }, action };
}

/**
 * Record a request in the tab's own mirror, show the tab the payload carrying it, and only then
 * send it. The order is the whole contract, so it lives here rather than at each call site.
 *
 * `topicAction` is synchronous end to end: it reaches the topic's action, which records the answer
 * and emits the change, and the emit runs this plugin's `notify` again before `topicAction` returns.
 * A request sent before the mirror holds it is therefore answered against the payload from *before*
 * it — which is either no tab at all, so the answer is dropped and the tab waits forever, or a tab
 * whose `pending` still names the request just answered, so the same answer is folded again and the
 * follow-up it issues recurses into another. A host that notifies unconditionally would hide the
 * first of those, so the mirror write comes first and the send comes last.
 */
export function dispatch(
  key: string,
  payload: SqlPayload,
  request: SqlRequest,
  capabilities: TabPluginServerCapabilities,
  tabs: SqlTabs,
  publish: (payload: SqlPayload) => void,
): void {
  const waiting: SqlPayload = { ...payload, pending: request.pending };
  tabs.write(key, waiting);
  publish(waiting);
  capabilities.topicAction(request.action);
}
