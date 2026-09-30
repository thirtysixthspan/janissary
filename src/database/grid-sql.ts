import type {
  DatabaseColumnView,
  DatabaseFilterView,
  DatabaseGridQuery,
  DatabaseOrderView,
} from '../protocol.js';
import { quoteIdentifier } from './schema.js';

// Builds the grid's statements. Identifiers are interpolated because every one of them came out of
// the server's own `sqlite_schema` read; values are never interpolated, only bound, so a value that
// happens to contain SQL cannot become part of a statement.

export type BoundStatement = {
  sql: string;
  parameters: (string | number)[];
};

// A filter's two-column form: the SQL fragment, and whatever it binds.
type Fragment = { text: string; values: (string | number)[] };

// A comparison binds a number when the text parses as one and text otherwise — which is what
// SQLite's dynamic typing does to that comparison anyway, so the grid and a hand-typed `WHERE` over
// the same column agree.
function boundValue(value: string): string | number {
  return value.trim() !== '' && Number.isFinite(Number(value)) ? Number(value) : value;
}

// `%` and `_` are LIKE wildcards, so a value containing one is escaped — otherwise searching for
// "50%" would match every value starting with "50". The escape character has to be named in the
// statement that carries the pattern: SQLite's `LIKE` has no default escape, so a lone backslash
// would be matched as itself and the search would find nothing at all.
const LIKE_ESCAPE = String.raw` ESCAPE '\'`;

function likeValue(value: string): string {
  const escaped = value.replaceAll('\\', '\\\\').replaceAll('%', String.raw`\%`).replaceAll('_', String.raw`\_`);
  return `%${escaped}%`;
}

const COMPARISONS = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' } as const;

function fragmentFor(filter: DatabaseFilterView): Fragment {
  const column = quoteIdentifier(filter.column);
  const value = filter.value ?? '';
  switch (filter.op) {
    case 'isNull': {
      return { text: `${column} IS NULL`, values: [] };
    }
    case 'notNull': {
      return { text: `${column} IS NOT NULL`, values: [] };
    }
    case 'contains': {
      return { text: `${column} LIKE ?${LIKE_ESCAPE}`, values: [likeValue(value)] };
    }
    case 'eq':
    case 'ne':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      return { text: `${column} ${COMPARISONS[filter.op]} ?`, values: [boundValue(value)] };
    }
  }
}

/**
 * The one term matched against every column of the object.
 *
 * Each column contributes its own `LIKE` and they are joined with `OR`, so a row survives if the
 * term is anywhere in it. `CAST(... AS TEXT)` is what makes that possible across types — a number,
 * a blob and a string are compared as text here and nowhere else — and `COALESCE` is what keeps a
 * null from making the whole row invisible to the term, since `NULL LIKE '%x%'` is not true.
 *
 * The value is bound once per column rather than once, because SQLite has no array parameter and a
 * placeholder is a placeholder. An object with no columns has no group to contribute.
 */
function globalFragment(term: string, columns: readonly DatabaseColumnView[]): Fragment {
  if (term === '' || columns.length === 0) return { text: '', values: [] };
  const value = likeValue(term);
  const text = columns
    .map((column) => `COALESCE(CAST(${quoteIdentifier(column.name)} AS TEXT), '') LIKE ?${LIKE_ESCAPE}`)
    .join(' OR ');
  return { text: `(${text})`, values: columns.map(() => value) };
}

/**
 * The object's whole `WHERE`, global term first so it binds ahead of the per-column clauses.
 *
 * The term is its own parenthesized group rather than folded into the `AND` chain on purpose: a row
 * has to match the term *and* every per-column filter, and dropping the parentheses would read as
 * "matches the term somewhere, or matches the first filter".
 */
export function whereClause(query: DatabaseGridQuery, columns: readonly DatabaseColumnView[]): Fragment {
  const parts = query.filters.map((filter) => fragmentFor(filter));
  const global = globalFragment(query.global ?? '', columns);
  const groups = [global.text, ...parts.map((part) => part.text)].filter((text) => text !== '');
  if (groups.length === 0) return { text: '', values: [] };
  return {
    text: ` WHERE ${groups.join(' AND ')}`,
    values: [...global.values, ...parts.flatMap((part) => part.values)],
  };
}

/**
 * The order actually used: the user's, or the object's primary key ascending, or its first column.
 * A page needs a total order, and `LIMIT ? OFFSET ?` over an unordered query skips and repeats rows.
 *
 * A requested column this object does not declare is dropped, for the same reason the `WHERE` is
 * built from the columns the server read rather than from the client's word: an order left in place
 * would name a column that is not there, and the statement would fail for a user who only asked to
 * look at another table. What is left falls back exactly as an orderless query does.
 */
export function resolveOrder(requested: readonly DatabaseOrderView[], columns: DatabaseColumnView[]): DatabaseOrderView[] {
  const names = new Set(columns.map((column) => column.name));
  const usable = requested.filter((entry) => names.has(entry.column));
  if (usable.length > 0) return [...usable];
  const key = columns.filter((column) => column.pk > 0).toSorted((a, b) => a.pk - b.pk);
  if (key.length > 0) return key.map((column) => ({ column: column.name, desc: false }));
  const first = columns[0];
  return first ? [{ column: first.name, desc: false }] : [];
}

export function orderClause(order: readonly DatabaseOrderView[]): string {
  if (order.length === 0) return '';
  const terms = order.map((entry) => `${quoteIdentifier(entry.column)} ${entry.desc ? 'DESC' : 'ASC'}`);
  return ` ORDER BY ${terms.join(', ')}`;
}

export function selectStatement(query: DatabaseGridQuery, columns: DatabaseColumnView[]): BoundStatement {
  const names = columns.length > 0 ? columns : [];
  if (names.length === 0) return { sql: '', parameters: [] };
  const where = whereClause(query, names);
  return {
    sql: `SELECT ${names.map((column) => quoteIdentifier(column.name)).join(', ')}`
      + ` FROM ${quoteIdentifier(query.object)}${where.text}${orderClause(resolveOrder(query.order, columns))}`
      + ' LIMIT ? OFFSET ?',
    parameters: [...where.values, query.limit, query.offset],
  };
}

/**
 * The count the pager and the export's row cap are read from.
 *
 * `columns` is required rather than defaulted: the global term is emitted per column, so a count
 * built without them would quietly drop it and disagree with the page it is counting.
 */
export function countStatement(query: DatabaseGridQuery, columns: readonly DatabaseColumnView[]): BoundStatement {
  const where = whereClause(query, columns);
  return {
    sql: `SELECT COUNT(*) AS n FROM ${quoteIdentifier(query.object)}${where.text}`,
    parameters: where.values,
  };
}
