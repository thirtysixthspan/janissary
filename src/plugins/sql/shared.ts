export const SQL_PAYLOAD_SCHEMA_VERSION = 1;

// What a database tab shows. Everything the view needs is here, including the grid page and the
// statement that produced it, so a payload is a complete description of the tab and the plugin holds
// no state anywhere else.

export type SqlObjectKind = 'table' | 'view' | 'index' | 'trigger';

// What a column points at, mirrored from the host. An empty target column means the referenced
// table's own key could not be resolved, which the grid treats as a reference it cannot follow.
export type SqlForeignKey = { table: string; columns: string[] };

export type SqlColumn = {
  name: string;
  type: string;
  notNull: boolean;
  pk: number;
  references?: SqlForeignKey;
};

export type SqlObject = {
  name: string;
  kind: SqlObjectKind;
  columns: SqlColumn[];
  writable: boolean;
};

export type SqlCell = { text: string; isNull: boolean };
export type SqlRow = { key: string; cells: SqlCell[] };

export type SqlFilterOperator =
  | 'contains' | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'isNull' | 'notNull';

export type SqlFilter = { column: string; op: SqlFilterOperator; value?: string };
export type SqlOrder = { column: string; desc: boolean };

export type SqlGrid = {
  sql: string;
  parameters: (string | number)[];
  columns: string[];
  rows: SqlRow[];
  total: number;
  unfilteredTotal: number;
  offset: number;
  limit: number;
  order: SqlOrder[];
};

// The console's most recent exchange, kept beside the grid so a write's outcome survives the next
// read. `changed` is 0 for a statement run through `exec`, which reports no count — the same reason
// `db sqlite query` answers a write with `OK.` rather than a number.
export type SqlConsoleResult = { sql: string; changed: number; error?: string };

export type SqlStatsColumn = {
  name: string;
  type: string;
  nulls: number;
  distinct: number;
  total: number;
  min?: string;
  max?: string;
  values: { label: string; count: number }[];
};

// One finished export. `ref` is the authenticated `/open/<id>` reference the host issued, minted
// once when the file was registered; the client turns it into a download URL with `resourceUrl`.
export type SqlExport = { name: string; size: string; rows: number; ref: string };

export type SqlDatabaseRef = { name: string; exists: boolean; open: boolean };

// What a tab is waiting for. `topicAction` returns nothing, so an answer arrives on the next
// `databases` delivery and this is what says which one the tab wants — and what to do once it lands,
// so a write knows to re-run the grid while a statistics read just fills the panel.
export type SqlPending = {
  id: string;
  followUp: 'schema' | 'query' | 'stats' | 'console' | 'export' | 'none';
};

export type SqlPayload = {
  database: string;
  databases: SqlDatabaseRef[];
  objects: SqlObject[];
  // The object the grid is showing, and the query it is showing it with. The grid's own statement
  // arrives in `grid.sql`; this is what produced it, so a filter change is a small intent rather
  // than a resend of the whole page.
  object: string;
  filters: SqlFilter[];
  // One term matched against every column at once, so a value can be looked for without knowing
  // which column holds it. Empty means none, and it is not a per-column filter: it survives a
  // switch to another object, because it names no column.
  global: string;
  order: SqlOrder[];
  limit: number;
  offset: number;
  // The page sizes the grid offers, published by the server so the control and the guard that
  // accepts one read the same list rather than two copies of it.
  pageSizes: number[];
  grid: SqlGrid | null;
  stats: SqlStatsColumn[] | null;
  console: SqlConsoleResult | null;
  exports: SqlExport[];
  error: string | null;
  pending: SqlPending | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function isListOf(guard: (entry: unknown) => boolean): (value: unknown) => boolean {
  return (value) => Array.isArray(value) && value.every((entry) => guard(entry));
}

/** Absent, null, or present and valid. The three states an optional payload part can be in. */
function isOptional(guard: (part: unknown) => boolean): (value: unknown) => boolean {
  return (value) => value === null || value === undefined || guard(value);
}

/**
 * A non-empty list of page sizes, every one of them safe to offer. This contract cannot import the
 * intent guard that owns the list — it must stay import-free, because the client executes it — so it
 * checks the shape and the non-emptiness, and `shared-intents.ts` checks membership against the real
 * list before a payload ever reaches here. A size the host would refuse never gets this far.
 */
function isPageSizes(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isNumber);
}

const FOLLOW_UPS = new Set<SqlPending['followUp']>([
  'schema', 'query', 'stats', 'console', 'export', 'none',
]);

const OPERATORS = new Set<string>([
  'contains', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'isNull', 'notNull',
]);

function isFilter(value: unknown): value is SqlFilter {
  if (!isRecord(value) || !isString(value.column) || !isString(value.op) || !OPERATORS.has(value.op)) {
    return false;
  }
  if (value.op === 'isNull' || value.op === 'notNull') return true;
  return isString(value.value);
}

function isOrder(value: unknown): value is SqlOrder {
  return isRecord(value) && isString(value.column) && typeof value.desc === 'boolean';
}

function isForeignKey(value: unknown): value is SqlForeignKey {
  return isRecord(value) && isString(value.table) && Array.isArray(value.columns) && value.columns.every(isString);
}

function isColumn(value: unknown): value is SqlColumn {
  if (!isRecord(value) || !isString(value.name) || !isString(value.type)) return false;
  if (typeof value.notNull !== 'boolean' || typeof value.pk !== 'number') return false;
  return value.references === undefined || isForeignKey(value.references);
}

function isObject(value: unknown): value is SqlObject {
  return isRecord(value)
    && isString(value.name)
    && ['table', 'view', 'index', 'trigger'].includes(String(value.kind))
    && Array.isArray(value.columns)
    && value.columns.every((column) => isColumn(column))
    && typeof value.writable === 'boolean';
}

function isCell(value: unknown): value is SqlCell {
  return isRecord(value) && isString(value.text) && typeof value.isNull === 'boolean';
}

function isRow(value: unknown): value is SqlRow {
  return isRecord(value) && isString(value.key) && Array.isArray(value.cells) && value.cells.every(isCell);
}

function isGrid(value: unknown): value is SqlGrid {
  return isRecord(value)
    && isString(value.sql)
    && Array.isArray(value.parameters)
    && value.parameters.every((entry) => isString(entry) || typeof entry === 'number')
    && Array.isArray(value.columns) && value.columns.every(isString)
    && Array.isArray(value.rows) && value.rows.every(isRow)
    && typeof value.total === 'number'
    && typeof value.unfilteredTotal === 'number'
    && typeof value.offset === 'number'
    && typeof value.limit === 'number'
    && Array.isArray(value.order) && value.order.every(isOrder);
}

function isStatsColumn(value: unknown): value is SqlStatsColumn {
  return isRecord(value)
    && isString(value.name)
    && isString(value.type)
    && typeof value.nulls === 'number'
    && typeof value.distinct === 'number'
    && typeof value.total === 'number'
    && Array.isArray(value.values)
    && value.values.every((entry) => isRecord(entry) && isString(entry.label) && typeof entry.count === 'number');
}

function isRef(value: unknown): value is SqlDatabaseRef {
  return isRecord(value) && isString(value.name) && typeof value.exists === 'boolean' && typeof value.open === 'boolean';
}

function isExport(value: unknown): value is SqlExport {
  return isRecord(value) && isString(value.name) && isString(value.size) && typeof value.rows === 'number' && isString(value.ref);
}

// Composed from the per-part guards rather than written out field by field: each part is already
// guarded where it is defined, so the payload guard's own job is only to check that every part is
// present and of the right kind. `null` is the "not asked for yet" value for the optional parts, and
// `undefined` is accepted for them so a payload that simply omits one is the same as one that says
// null — the plugin never writes the difference deliberately.
export function isSqlPayload(value: unknown): value is SqlPayload {
  if (!isRecord(value)) return false;
  const parts: [unknown, (part: unknown) => boolean][] = [
    [value.database, isString],
    [value.object, isString],
    [value.objects, isListOf(isObject)],
    [value.global, isString],
    [value.filters, isListOf(isFilter)],
    [value.order, isListOf(isOrder)],
    [value.limit, isNumber],
    [value.offset, isNumber],
    // The sizes must be ones the intent guard would accept. That is the whole reason the server
    // publishes them: a payload carrying a size the host refuses is a payload this plugin got wrong,
    // and a control offering a size the guard refuses is a dead option.
    [value.pageSizes, isPageSizes],
    [value.databases, isListOf(isRef)],
    [value.exports, isListOf(isExport)],
    [value.grid, isOptional(isGrid)],
    [value.stats, isOptional(isListOf(isStatsColumn))],
    [value.console, isOptional(isConsoleResult)],
    [value.error, isOptional(isString)],
    [value.pending, isOptional(isPending)],
  ];
  return parts.every(([part, guard]) => guard(part));
}

function isConsoleResult(value: unknown): value is SqlConsoleResult {
  return isRecord(value) && isString(value.sql) && typeof value.changed === 'number'
    && (value.error === undefined || isString(value.error));
}

function isPending(value: unknown): value is SqlPending {
  if (!isRecord(value) || !isString(value.id) || !isString(value.followUp)) return false;
  return FOLLOW_UPS.has(value.followUp as SqlPending['followUp']);
}
