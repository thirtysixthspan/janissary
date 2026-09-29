import type { SqlFilterOperator, SqlPayload } from './shared.js';

// The pure payload transformations the intent handlers apply, kept beside them so each one can be
// read — and reasoned about — without the request machinery around it. None of these touches the
// capabilities or the tab: they answer only "what should the payload read afterwards", and the
// handler issues the query from that answer.

/**
 * The order actually used, or the one a further press would add: a new column starts ascending,
 * the current one flips, and the third press removes it. Cycling rather than accumulating is what
 * stops a grid growing an order list as a user experiments.
 */
export function toggledOrder(payload: SqlPayload, column: string) {
  const existing = payload.order[0];
  if (existing?.column !== column) return [{ column, desc: false }];
  return existing.desc ? [] : [{ column, desc: true }];
}

/**
 * The filter list with this column's filter set, or removed when it was already set this way.
 *
 * Replacing rather than stacking is what stops a grid accumulating an unbounded filter list as a
 * user experiments, and removing the identical one is what makes a second press undo the first.
 */
export function withFilter(
  payload: SqlPayload,
  column: string,
  op: SqlFilterOperator,
  value: string | undefined,
) {
  const same = payload.filters.find((filter) => filter.column === column);
  const identical = same?.op === op && same?.value === value;
  const next = op === 'isNull' || op === 'notNull' ? { column, op } : { column, op, value };
  return identical
    ? payload.filters.filter((filter) => filter.column !== column)
    : [...payload.filters.filter((filter) => filter.column !== column), next];
}

/**
 * The payload as it should read once another object has been selected.
 *
 * A filter and a hidden column are both facts about a column of *one* object, not facts that follow
 * the user around: keeping `status = 'paid'` while looking at a table with no `status` column builds
 * a statement SQLite rejects outright, so the ones the new object does not have are dropped here
 * rather than at the query. An object the tab has never listed has no known columns, and knowing
 * nothing is no reason to drop anything — only a column this object demonstrably lacks goes.
 */
export function selected(
  payload: SqlPayload,
  value: { object: string; column?: string; value?: string },
): SqlPayload {
  const names = payload.objects.find((object) => object.name === value.object)?.columns.map((column) => column.name);
  const present = (name: string) => names?.includes(name) ?? true;
  // A carried filter replaces any existing one on the same column rather than stacking with it.
  const carried = value.column === undefined
    ? []
    : [{ column: value.column, op: 'eq' as const, value: value.value ?? '' }];
  const merged = value.column === undefined
    ? payload.filters
    : [...payload.filters.filter((filter) => filter.column !== value.column), ...carried];
  return {
    ...payload,
    filters: merged.filter((filter) => present(filter.column)),
    hidden: payload.hidden.filter((name) => present(name)),
  };
}

/**
 * The payload with this whole hidden set, minus any name the statement that ran does not carry.
 *
 * `grid.columns` comes from the statement, so a name that is not in it cannot be hidden — recording
 * it would leave an entry nothing ever clears, on a column the grid can no longer name.
 */
export function withHidden(payload: SqlPayload, hidden: readonly string[]): SqlPayload {
  const columns = payload.grid?.columns ?? [];
  return { ...payload, hidden: hidden.filter((name) => columns.includes(name)) };
}
