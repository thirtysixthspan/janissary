import { randomUUID } from 'node:crypto';
import type { TabPluginServerCapabilities, TabPluginTopicAction } from '../api.js';
import type { SqlPayload, SqlPending } from './shared.js';
import type { SqlTabs } from './tabs.js';

// A request the plugin is about to make, and the topic action that will answer it. Kept together so
// the payload that records "I am waiting for this" and the action that is sent cannot drift apart.
export type SqlRequest = { pending: SqlPending; action: TabPluginTopicAction };

/** A fresh request id, minted here because the host echoes one back rather than issuing it. */
export function newRequestId(): string {
  return randomUUID();
}

export function gridQueryOf(payload: SqlPayload) {
  return {
    object: payload.object,
    filters: payload.filters.map((filter) => ({ ...filter })),
    global: payload.global,
    order: payload.order.map((entry) => ({ ...entry })),
    limit: payload.limit,
    offset: payload.offset,
  };
}

/**
 * Plan a read the tab will make once it has been told what to do with the answer. `then` is what
 * makes a follow-up part of the request rather than a guess in the notification: a schema read picks
 * an object, a write re-runs the grid, a statistics read only fills the panel.
 */
export function planRequest(
  action: 'schema' | 'query' | 'stats' | 'export' | 'create',
  payload: SqlPayload,
  options: { format?: 'csv' | 'json' } = {},
): SqlRequest {
  const id = newRequestId();
  const pending: SqlPending = { id, followUp: action === 'create' ? 'schema' : action };
  const shared = { topic: 'databases', database: payload.database, requestId: id } as const;
  switch (action) {
    case 'create':
    case 'schema': {
      return { pending, action: { ...shared, action } };
    }
    case 'query': {
      return { pending, action: { ...shared, action, query: gridQueryOf(payload) } };
    }
    case 'stats': {
      return { pending, action: { ...shared, action, object: payload.object } };
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
