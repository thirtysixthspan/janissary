import { isRecord } from '../value-guards.js';
import type {
  VisualizationColumnType,
  VisualizationColumnView,
} from '../protocol/visualizations.js';

// The two shapes a source can be, and the bounds the tab payload imposes on what comes out of them.
//
// A cap exists because `emitState` re-broadcasts every tab's payload on essentially every mutation
// (architecture-principles.md §8), so a table unbounded here is a cost paid by every keystroke in
// every tab. Five hundred rows is well past what a bar chart renders legibly, and the window carries
// the true total so the tab can say what it is showing of what exists rather than implying otherwise.
// The real fix is the delta-and-sequence transport §8 asks for, which is an architecture change well
// outside this feature.
export const MAX_ROWS = 500;
export const MAX_COLUMNS = 32;

export type Cell = string | number | boolean | null;
export type Table = { columns: VisualizationColumnView[]; rows: Cell[][] };
export type TableResult =
  | { table: Table; total: number; truncated: boolean }
  | { error: string };

// The delimiters sniffed from the header line, in the order they are tried. Tab comes first because a
// semicolon or a pipe is a legitimate character inside a tab-separated file far more often than a
// tab is inside an otherwise semicolon-separated one.
const DELIMITERS = ['\t', ',', ';', '|'] as const;

const TRUTHY = new Set(['true', 'yes', '1']);
const FALSY = new Set(['false', 'no', '0']);

const UNEXPECTED_SHAPE = 'expected an array of objects, or an object holding one';

function numberOrUndefined(value: Cell): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanOrUndefined(value: Cell): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;
  const text = value.trim().toLowerCase();
  if (TRUTHY.has(text)) return true;
  if (FALSY.has(text)) return false;
  return undefined;
}

// A column is numeric when every non-empty value in it is, and boolean when every value is. An empty
// column is a string: it has told us nothing, and claiming a type it does not have would let a chart
// claim a measure that is not there. Dates are deliberately not inferred — a date column stays a
// string, so a line chart over it draws a category axis rather than guessing a timezone.
function inferType(values: readonly Cell[]): VisualizationColumnType {
  const present = values.filter((value) => value !== null && value !== '');
  if (present.length === 0) return 'string';
  if (present.every((value) => numberOrUndefined(value) !== undefined)) return 'number';
  if (present.every((value) => booleanOrUndefined(value) !== undefined)) return 'boolean';
  return 'string';
}

function buildColumns(names: string[], rows: Cell[][]): VisualizationColumnView[] {
  return names.map((name, index) => ({
    name,
    type: inferType(rows.map((row) => row[index] ?? null)),
  }));
}

// Column names are trimmed, de-duplicated in first-seen order, and capped. A duplicate name would
// otherwise make a specification ambiguous about which column it named.
function uniqueNames(names: readonly string[]): string[] {
  const unique: string[] = [];
  for (const raw of names) {
    const name = raw.trim() || 'column';
    if (!unique.includes(name)) unique.push(name);
    if (unique.length === MAX_COLUMNS) break;
  }
  return unique;
}

function finish(names: string[], rows: Cell[][], total: number, capped: boolean): TableResult {
  if (names.length === 0) return { error: 'the source has no columns' };
  return {
    table: { columns: buildColumns(names, rows), rows },
    total,
    // Either bound reaching its ceiling counts as truncation, because a column dropped silently would
    // make a specification naming it look wrong rather than making the chart incomplete.
    truncated: capped || total > rows.length,
  };
}

// Splits one delimited line, honouring double-quoted fields and treating a doubled quote inside one
// as a literal. Returns nothing for a line that never closed its quote, which is how a truncated
// download surfaces rather than silently losing its tail.
function splitDelimited(line: string, delimiter: string): string[] | undefined {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (quoted) {
      if (character !== '"') { field += character; continue; }
      if (line[index + 1] === '"') { field += '"'; index += 1; continue; }
      quoted = false;
      continue;
    }
    if (character === '"' && field === '') { quoted = true; continue; }
    if (character === delimiter) { fields.push(field); field = ''; continue; }
    field += character;
  }
  return quoted ? undefined : [...fields, field];
}

function cell(field: string | undefined): Cell {
  if (field === undefined || field === '') return null;
  const parsed = Number(field);
  return field.trim() !== '' && Number.isFinite(parsed) ? parsed : field;
}

export function parseDelimitedText(text: string): TableResult {
  const lines = text.split(/\r?\n/u).filter((line) => line.trim() !== '');
  const header = lines[0];
  if (header === undefined) return { error: 'the source is empty' };
  // No delimiter is not a refusal: a one-column document has none to find, and its header is its only
  // column. The table it produces will usually be unchartable, and `chartable` says so by name.
  const delimiter = DELIMITERS.find((candidate) => header.includes(candidate)) ?? '\u{0}';
  const names = splitDelimited(header, delimiter);
  if (names === undefined) return { error: 'the header row has an unclosed quoted field' };
  const all = uniqueNames(names);
  const capped = all.length < names.length;
  const columns = all.slice(0, MAX_COLUMNS);
  const rows: Cell[][] = [];
  for (const line of lines.slice(1)) {
    if (rows.length === MAX_ROWS) break;
    const fields = splitDelimited(line, delimiter);
    if (fields === undefined) return { error: 'a row has an unclosed quoted field' };
    rows.push(columns.map((_, index) => cell(fields[index])));
  }
  return finish(columns, rows, lines.length - 1, capped);
}

function flatObjects(values: readonly unknown[]): Record<string, unknown>[] {
  return values.filter(isRecord);
}

// The accepted JSON shapes are an array of objects, or an object holding one. The search descends at
// most one level, because `{"data": {"items": [...]}}` is a shape APIs return constantly and refusing
// it would make "point at a source" fail on ordinary input — but an unbounded walk for the first
// array anywhere in a document is guesswork, so it stops at the second level and says so.
function objectArray(parsed: unknown): Record<string, unknown>[] | { error: string } {
  if (Array.isArray(parsed)) return flatObjects(parsed);
  if (!isRecord(parsed)) return { error: UNEXPECTED_SHAPE };
  const values = Object.values(parsed);
  const direct = values.filter((value) => Array.isArray(value));
  if (direct.length > 0) {
    return direct.length === 1 ? flatObjects(direct[0] as unknown[]) : { error: UNEXPECTED_SHAPE };
  }
  const nested = values
    .filter((value) => isRecord(value))
    .flatMap((child) => Object.values(child).filter((value) => Array.isArray(value)));
  return nested.length === 1 ? flatObjects(nested[0] as unknown[]) : { error: UNEXPECTED_SHAPE };
}

function asCell(value: unknown): Cell {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : String(value);
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  return JSON.stringify(value);
}

export function parseJsonText(text: string): TableResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { error: `not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const records = objectArray(parsed);
  if ('error' in records) return records;
  if (records.length === 0) return { error: 'the source holds no records' };
  const names: string[] = [];
  for (const record of records) {
    for (const name of Object.keys(record)) if (!names.includes(name)) names.push(name);
  }
  const all = uniqueNames(names);
  const capped = all.length < names.length;
  const columns = all.slice(0, MAX_COLUMNS);
  const rows = records
    .slice(0, MAX_ROWS)
    .map((record) => columns.map((name) => (Object.hasOwn(record, name) ? asCell(record[name]) : null)));
  return finish(columns, rows, records.length, capped);
}

// A table with no numeric column cannot be charted against a measure, and saying so here is better
// than a tab that opens on an empty plot area.
export function chartable(table: Table): { error: string } | { ok: true } {
  if (table.rows.length === 0) return { error: 'the source has no rows' };
  if (table.columns.every((column) => column.type !== 'number')) {
    return { error: 'the source has no numeric column to measure' };
  }
  return { ok: true };
}
