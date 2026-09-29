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
// "50%" would match every value starting with "50".
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
      return { text: `${column} LIKE ?`, values: [likeValue(value)] };
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

export function whereClause(filters: readonly DatabaseFilterView[]): Fragment {
  const parts = filters.map((filter) => fragmentFor(filter));
  if (parts.length === 0) return { text: '', values: [] };
  return {
    text: ` WHERE ${parts.map((part) => part.text).join(' AND ')}`,
    values: parts.flatMap((part) => part.values),
  };}

/**
 * The order actually used: the user's, or the object's primary key ascending, or its first column.
 * A page needs a total order, and `LIMIT ? OFFSET ?` over an unordered query skips and repeats rows.
 */
export function resolveOrder(requested: readonly DatabaseOrderView[], columns: DatabaseColumnView[]): DatabaseOrderView[] {
  if (requested.length > 0) return [...requested];
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
  const where = whereClause(query.filters);
  return {
    sql: `SELECT ${names.map((column) => quoteIdentifier(column.name)).join(', ')}`
      + ` FROM ${quoteIdentifier(query.object)}${where.text}${orderClause(resolveOrder(query.order, columns))}`
      + ' LIMIT ? OFFSET ?',
    parameters: [...where.values, query.limit, query.offset],
  };
}

export function countStatement(query: DatabaseGridQuery): BoundStatement {
  const where = whereClause(query.filters);
  return {
    sql: `SELECT COUNT(*) AS n FROM ${quoteIdentifier(query.object)}${where.text}`,
    parameters: where.values,
  };
}
