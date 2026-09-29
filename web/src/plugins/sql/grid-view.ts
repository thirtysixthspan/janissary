import type {
  SqlCell,
  SqlFilter,
  SqlGrid,
  SqlObject,
  SqlPayload,
} from '@shared/plugins/sql/shared';
import type { SqlStatsColumn } from '@shared/plugins/sql/shared';

// Pure view arithmetic, kept out of the components so it is testable without a render: where a page
// starts and ends, what the pager says, what a filter chip reads, and what a cell shows.

/** `Rows 1–100 of 4,213`, with the object's own total beside it once a filter is narrowing. */
export function pageLabel(grid: SqlGrid): string {
  if (grid.rows.length === 0) return 'No rows.';
  const first = grid.offset + 1;
  const last = grid.offset + grid.rows.length;
  const total = grid.total === grid.unfilteredTotal
    ? `${grid.total.toLocaleString('en-US')} row${grid.total === 1 ? '' : 's'}`
    : `${grid.total.toLocaleString('en-US')} of ${grid.unfilteredTotal.toLocaleString('en-US')} rows`;
  return `Rows ${first.toLocaleString('en-US')}–${last.toLocaleString('en-US')} of ${total}`;
}

export function hasPrevious(grid: SqlGrid | null): boolean {
  return grid !== null && grid.offset > 0;
}

export function hasNext(grid: SqlGrid | null): boolean {
  return grid !== null && grid.offset + grid.rows.length < grid.total;
}

export function previousOffset(grid: SqlGrid | null): number {
  return Math.max(0, (grid?.offset ?? 0) - (grid?.limit ?? 100));
}

export function nextOffset(grid: SqlGrid | null): number {
  return (grid?.offset ?? 0) + (grid?.limit ?? 100);
}

/**
 * The offset that starts a page at the row the user named, or null when they named no row.
 *
 * Rows are numbered from 1 because that is how the page label numbers them, so the offset is one page
 * short of the row. Past the end it clamps to the last page rather than rounding up past it — a
 * typed number the user got wrong should land them at the end and show them that, not show nothing.
 * A row that is not a whole number above zero is refused rather than guessed at: `null` asks for no
 * page at all, so the control can sit there unchanged until the number makes sense.
 */
export function goToRow(value: string, grid: SqlGrid | null): number | null {
  const row = Number(value.trim());
  if (!Number.isSafeInteger(row) || row < 1) return null;
  const limit = grid?.limit ?? 100;
  const startOf = (rowNumber: number) => Math.floor((rowNumber - 1) / limit) * limit;
  return Math.min(startOf(row), Math.max(0, startOf(Math.max(1, grid?.total ?? 1))));
}

/**
 * The columns the grid shows, each with the position it holds in the row's cells.
 *
 * The index travels with the name because `row.cells` is positional: dropping a column from the
 * header without also dropping it from each row would leave every cell after it showing the value of
 * its neighbour. A hidden column is still selected and still filtered -- the `SELECT` is untouched --
 * so this is a view concern and the cell it would have held is simply not rendered.
 */
export function visibleColumns(
  columns: readonly string[],
  hidden: readonly string[],
): { name: string; index: number }[] {
  return columns
    .map((name, index) => ({ name, index }))
    .filter((column) => !hidden.includes(column.name));
}

/**
 * The hidden set with one column added or removed, in place.
 *
 * A name that is not in `columns` is ignored: `grid.columns` comes from the statement that ran, so a
 * column that is not there cannot be hidden, and recording it would leave a stale entry that nothing
 * ever clears.
 */
export function toggleColumn(
  columns: readonly string[],
  hidden: readonly string[],
  name: string,
): string[] {
  if (!columns.includes(name)) return [...hidden];
  return hidden.includes(name) ? hidden.filter((entry) => entry !== name) : [...hidden, name];
}

const OPERATOR_TEXT: Record<SqlFilter['op'], string> = {
  contains: 'contains',
  eq: '=',
  ne: '≠',
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  isNull: 'is null',
  notNull: 'is not null',
};

export function filterLabel(filter: SqlFilter): string {
  const operator = OPERATOR_TEXT[filter.op];
  if (filter.op === 'isNull' || filter.op === 'notNull') return `${filter.column} ${operator}`;
  return `${filter.column} ${operator} ${filter.value}`;
}

const NULL_TEXT = 'NULL';

export function cellText(cell: SqlCell): string {
  return cell.isNull ? NULL_TEXT : cell.text;
}

export function isNullCell(cell: SqlCell): boolean {
  return cell.isNull;
}

/** The navigator's groups, in the order it draws them, with a trigger group nothing browses. */
export function groupedObjects(objects: readonly SqlObject[]): { kind: SqlObject['kind']; label: string; entries: SqlObject[] }[] {
  const labels: { kind: SqlObject['kind']; label: string }[] = [
    { kind: 'table', label: 'Tables' },
    { kind: 'view', label: 'Views' },
    { kind: 'index', label: 'Indexes' },
    { kind: 'trigger', label: 'Triggers' },
  ];
  return labels
    .map(({ kind, label }) => ({ kind, label, entries: objects.filter((object) => object.kind === kind) }))
    .filter((group) => group.entries.length > 0);
}

/** A trigger is listed but not browsable, so the navigator marks it rather than hiding it. */
export function browsable(object: SqlObject): boolean {
  return object.kind === 'table' || object.kind === 'view';
}

export function currentObject(payload: SqlPayload): SqlObject | undefined {
  return payload.objects.find((object) => object.name === payload.object);
}

export function readOnlyReason(object: SqlObject | undefined): string | null {
  if (!object) return null;
  if (object.kind === 'view') return `Read-only: "${object.name}" is a view.`;
  if (!object.writable) return `Read-only: "${object.name}" has no primary key.`;
  return null;
}

export function columnCount(object: SqlObject): string {
  return `${object.columns.length} col${object.columns.length === 1 ? '' : 's'}`;
}

/** The largest bar in a column's distribution, so the others scale against a real maximum. */
export function barScale(column: SqlStatsColumn): number {
  let largest = 0;
  for (const entry of column.values) largest = Math.max(largest, entry.count);
  return largest;
}

function sqlLiteral(value: string | number): string {
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  return `'${value.replaceAll("'", "''")}'`;
}

/**
 * The grid's statement with its bound values written in, so it can be run as it is shown.
 *
 * This is the one place in the browser that puts a value into SQL rather than binding it, which is
 * why the drawer shows the placeholder form alongside: `sql` is what executed, and this is a
 * rendering of it made runnable. Substitution is positional — the nth `?` takes the nth value — and
 * it assumes a statement the grid produced, which never carries a `?` inside a string literal
 * because every value in it is bound and no literal text is interpolated.
 *
 * A count that does not match degrades visibly rather than silently: an unmatched `?` is left as
 * written, and a value with no `?` left for it is dropped, so a caller pairing the wrong two
 * arguments finds out from the statement rather than from a wrong result.
 */
export function renderRunnableSql(sql: string, parameters: readonly (string | number)[]): string {
  const parts = sql.split('?');
  if (parts.length === 1) return sql;
  let built = parts[0] ?? '';
  for (let index = 1; index < parts.length; index += 1) {
    const value = parameters[index - 1];
    built += value === undefined ? '?' : sqlLiteral(value);
    built += parts[index] ?? '';
  }
  return built;
}

