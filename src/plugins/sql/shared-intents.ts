import type { SqlFilterOperator } from './shared.js';

// The intent payload types and the guards that decide whether a request is well formed.
//
// They live beside the tab-payload contract rather than inside it because they run on one side only:
// `isSqlPayload` is what the client executes, and it has to stay import-free for that. These run on
// the server, in the guarded intent table, so they may share the tab contract's own type
// declarations and its two value guards rather than carrying a second copy of each.

export type OpenIntent = { name: string };
// A filter rides along with the selection rather than following it. `topicAction` is
// fire-and-forget and the tab's payload only changes when the answer arrives, so a `set-filter`
// sent just after a `select-object` would build its query against the object the user just left.
export type SelectObjectIntent = { object: string; column?: string; value?: string };
export type SetFilterIntent = { column: string; op: SqlFilterOperator; value?: string };
// Which state the chip is switching *to*, not a flip: two presses in quick succession would each ask
// for "the other one" and undo each other, while naming the state lands on it either way.
export type SetFilterEnabledIntent = { column: string; enabled: boolean };
// The one term matched against every column. Any string is accepted and bound, exactly as a
// per-column value is; an empty one removes the term, so clearing it needs no separate intent.
export type SetGlobalFilterIntent = { value: string };
// The whole hidden set rather than a toggle, so a client cannot grow it one call at a time into
// something the grid then has to reconcile.
export type SetColumnsIntent = { hidden: string[] };
export type ClearFiltersIntent = Record<string, never>;
export type SetOrderIntent = { column: string };
export type SetPageIntent = { offset: number };
export type SetPageSizeIntent = { limit: number };
export type RefreshIntent = Record<string, never>;
export type RunIntent = { sql: string };
export type UpdateCellIntent = { row: string; column: string; value: string | null };
export type InsertRowIntent = { object: string; cells: { column: string; value: string | null }[] };
export type DeleteRowIntent = { row: string };
export type ExportIntent = { format: 'csv' | 'json' };

// The page sizes the grid offers. Kept here rather than in the component so the guard that decides
// whether a page size is acceptable and the control that offers them cannot disagree.
export const PAGE_SIZES = [50, 100, 500];

const OPERATORS = new Set<SqlFilterOperator>([
  'contains', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'isNull', 'notNull',
]);

// The one name rule the registry enforces, re-checked here so a hand-sent intent cannot ask the host
// for a database whose name it would refuse at the file layer.
const VALID_NAME = /^[A-Za-z0-9_-]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isNullableString(value: unknown): value is string | null {
  return value === null || isString(value);
}

function isOperator(value: unknown): value is SqlFilterOperator {
  return isString(value) && OPERATORS.has(value as SqlFilterOperator);
}

function isNoFilterValue(op: SqlFilterOperator): boolean {
  return op === 'isNull' || op === 'notNull';
}

function isEmpty(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}

export const isClearFiltersIntent = isEmpty;
export const isRefreshIntent = isEmpty;

// A database name the registry would accept. Re-checked here so a hand-sent intent, and a typed
// `sql <name>`, cannot ask the host for a name its own file layer would refuse — the same rule
// `dbPath` enforces.
export function isValidDatabaseName(value: unknown): value is string {
  return isString(value) && VALID_NAME.test(value);
}

export function isOpenIntent(value: unknown): value is OpenIntent {
  return isRecord(value) && isValidDatabaseName(value.name);
}

// A name plus, optionally, the sidebar to dock it into: `sql shop left` and `sql shop`.
export type OpenCommand = { name: string; dock: 'left' | 'right' | null | undefined };

export function parseOpenCommand(argument: string): OpenCommand | 'usage' {
  const words = argument.trim().split(/\s+/).filter(Boolean);
  const last = words.at(-1) ?? '';
  const dock = last === 'left' || last === 'right' ? last : words.length > 0 ? undefined : null;
  const name = dock === undefined ? words.join(' ') : words.slice(0, -1).join(' ');
  if (words.length === 0) return { name: '', dock: null };
  if (dock === undefined && !name) return 'usage';
  return { name, dock };
}

export function isSelectObjectIntent(value: unknown): value is SelectObjectIntent {
  if (!isRecord(value) || !isString(value.object)) return false;
  // A column and a value are one thing or neither. Accepting a value with no column would filter on
  // nothing, and accepting a column with no value would filter on `undefined` — so both halves are
  // required together, and a lone one is refused rather than quietly dropped.
  if (value.column === undefined) return value.value === undefined;
  return isString(value.column) && isString(value.value);
}

export function isSetFilterIntent(value: unknown): value is SetFilterIntent {
  if (!isRecord(value) || !isString(value.column) || !isOperator(value.op)) return false;
  if (isNoFilterValue(value.op)) return true;
  return isString(value.value);
}

export function isSetFilterEnabledIntent(value: unknown): value is SetFilterEnabledIntent {
  return isRecord(value) && isString(value.column) && typeof value.enabled === 'boolean';
}

export function isSetOrderIntent(value: unknown): value is SetOrderIntent {
  return isRecord(value) && isString(value.column);
}

export const isSetGlobalFilterIntent = (value: unknown): value is SetGlobalFilterIntent =>
  isRecord(value) && isString(value.value);

export function isSetColumnsIntent(value: unknown): value is SetColumnsIntent {
  return isRecord(value) && Array.isArray(value.hidden) && value.hidden.every(isString);
}

export function isSetPageIntent(value: unknown): value is SetPageIntent {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.offset) && (value.offset as number) >= 0;
}

export function isSetPageSizeIntent(value: unknown): value is SetPageSizeIntent {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.limit) && PAGE_SIZES.includes(value.limit as number);
}

export function isRunIntent(value: unknown): value is RunIntent {
  return isRecord(value) && isString(value.sql) && value.sql.trim() !== '';
}

export function isUpdateCellIntent(value: unknown): value is UpdateCellIntent {
  return isRecord(value) && isString(value.row) && isString(value.column) && isNullableString(value.value);
}

export function isInsertRowIntent(value: unknown): value is InsertRowIntent {
  return isRecord(value)
    && isString(value.object)
    && Array.isArray(value.cells)
    && value.cells.every((cell) => isRecord(cell) && isString(cell.column) && isNullableString(cell.value));
}

export function isDeleteRowIntent(value: unknown): value is DeleteRowIntent {
  return isRecord(value) && isString(value.row);
}


export function isExportIntent(value: unknown): value is ExportIntent {
  return isRecord(value) && (value.format === 'csv' || value.format === 'json');
}

