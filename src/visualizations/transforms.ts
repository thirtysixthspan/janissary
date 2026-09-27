// The four transformations a chat can ask for, applied in order to a raw table before any marks are
// built. Pure throughout: the same table and the same steps always produce the same result, which is
// what lets a re-read re-apply them and get the chart the user asked for rather than the one the
// first read happened to produce.
//
// Applied in order rather than as a set of settings, because the interesting combinations are
// compositions: a `sort` followed by a `limit` is a top-N, and the reverse is a first-N. Every step
// is checked against the table the steps before it left, so a `derive` a chart then plots is a column
// that exists by the time it is needed, and a step naming a column that is not there is refused by
// name rather than quietly doing nothing.

import { isIsoDate } from './dates.js';
import { compileExpression, evaluateExpression } from './transform-expression.js';
import type { Cell, Table } from './table.js';
import type {
  VisualizationColumnType,
  VisualizationCompare,
  VisualizationFilter,
  VisualizationTransform,
} from '../protocol/visualizations.js';

// The step list is bounded at the grammar rather than here — `chart-spec.ts`'s guard is where every
// route into a stored transformation passes, and one bound in one place is easier to keep true than
// two that have to agree.

function columnIndex(table: Table, name: string): number {
  return table.columns.findIndex((column) => column.name === name);
}

function columnType(table: Table, name: string): VisualizationColumnType | undefined {
  return table.columns.find((column) => column.name === name)?.type;
}

// A cell as the value of a column of the declared type, or undefined when it is not one. The four
// types each have their own order, and a filter compares in that order: an instant for a date, a
// number for a number, a boolean for a boolean, and a string for text. A number that cannot be read as
// one is nothing rather than `NaN`, and an empty cell is nothing rather than `0` — `Number` does both,
// and a filter built on either matched nothing at all while looking like a chart about a data set with
// no such rows in it.
function typed(table: Table, name: string, cell: Cell): string | number | boolean | undefined {
  const type = columnType(table, name);
  if (type === 'date') return instant(cell);
  if (type === 'boolean') return booleanOf(cell);
  if (type === 'number') {
    if (typeof cell === 'number') return cell;
    if (typeof cell === 'string') {
      const value = Number(cell.trim());
      return cell.trim() !== '' && Number.isFinite(value) ? value : undefined;
    }
    return undefined;
  }
  return cell === null ? '' : String(cell);
}

function instant(cell: Cell): number | undefined {
  const raw = cell === null ? '' : String(cell);
  return isIsoDate(raw) ? Date.parse(raw.trim()) : undefined;
}

function booleanOf(cell: Cell): boolean | undefined {
  if (typeof cell === 'boolean') return cell;
  if (cell === 'true' || cell === '1') return true;
  if (cell === 'false' || cell === '0') return false;
  return undefined;
}

function text(value: Cell | undefined): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
}

function ordered(a: string | number | boolean | undefined, b: string | number | boolean | undefined): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  return text(a).localeCompare(text(b));
}

function matches(
  cell: string | number | boolean | undefined,
  value: string | number | boolean | undefined,
  compare: VisualizationCompare,
): boolean {  switch (compare) {
    case 'eq':
    case 'in': {
      return ordered(cell, value) === 0;
    }
    case 'ne': {
      return ordered(cell, value) !== 0;
    }
    case 'gt': {
      return ordered(cell, value) > 0;
    }
    case 'gte': {
      return ordered(cell, value) >= 0;
    }
    case 'lt': {
      return ordered(cell, value) < 0;
    }
    case 'lte': {
      return ordered(cell, value) <= 0;
    }
    default: {
      return text(cell).includes(text(value));
    }
  }
}

// One step's answer: the table it produced, or why it could not. A step that finds nothing to keep
// produces a table with no rows rather than failing, because "only 2024" against a 2023-only source
// is a question with an empty answer, not an error.
type Applied = { table: Table } | { error: string };

// The four types this module knows, said the way a sentence wants them: a value is "not a number" and a
// column "holds numbers", rather than the same noun twice in one clause.
const ARTICLES: Record<VisualizationColumnType, string> = {
  number: 'a number',
  date: 'a date',
  boolean: 'a boolean',
  string: 'a string',
};

const PLURALS: Record<VisualizationColumnType, string> = {
  number: 'numbers',
  date: 'dates',
  boolean: 'booleans',
  string: 'strings',
};

function filterStep(table: Table, step: VisualizationFilter): Applied {
  const index = columnIndex(table, step.column);
  const type = columnType(table, step.column);
  if (index === -1 || type === undefined) return { error: `no column named "${step.column}" to filter on` };
  const values = step.values ?? [step.value ?? null];
  // A value that is not of the column's own type is refused by name, the way a missing column is. It
  // used to compare as nothing and match no row, which is a chart with no marks and no reason anywhere
  // on screen — indistinguishable, to the person looking at it, from a filter that was always going to
  // come back empty. A `null` value is left alone: it is how you ask for the cells that are empty.
  for (const value of values) {
    if (value !== null && typed(table, step.column, value) === undefined) {
      const kind = ARTICLES[type];
      return { error: `"${text(value)}" is not ${kind}, and "${step.column}" holds ${PLURALS[type]}` };
    }
  }
  const kept = table.rows.filter((row) => {
    const cell = typed(table, step.column, row[index] ?? null);
    return values.some((value) => matches(cell, typed(table, step.column, value), step.compare));
  });
  return { table: { ...table, rows: kept } };
}

function deriveStep(table: Table, name: string, expression: string): Applied {
  const existing = columnIndex(table, name);
  if (existing !== -1) return { error: `there is already a column named "${name}"` };
  const compiled = compileExpression(expression, table);
  if (!compiled) return { error: `"${expression}" is not an expression over ${describeColumns(table)}` };
  return {
    table: {
      columns: [...table.columns, { name, type: 'number' as const }],
      rows: table.rows.map((row) => [...row, evaluateExpression(compiled, row)]),
    },
  };
}

function describeColumns(table: Table): string {
  return table.columns.map((column) => `"${column.name}"`).join(', ');
}

// A stable sort throughout, so two rows of equal value keep the order the source listed them in and
// an unstable sort could not redraw the same chart differently on the next run.
function sortStep(table: Table, column: string, direction: 'asc' | 'desc'): Applied {
  const index = columnIndex(table, column);
  if (index === -1) return { error: `no column named "${column}" to sort on` };
  const sign = direction === 'desc' ? -1 : 1;
  const rows = table.rows
    .map((row, at) => ({ row, at }))
    .toSorted((a, b) => sign * ordered(typed(table, column, a.row[index] ?? null), typed(table, column, b.row[index] ?? null)) || a.at - b.at)
    .map((entry) => entry.row);
  return { table: { ...table, rows } };
}

// Counted in the chart's own categories rather than in rows, and for the reason the chart's former
// **Show** control was: a cap counted in rows drops some of a category's series and leaves the rest,
// which is a chart with a bar a different height from its neighbour and nothing to explain it. Zero is
// refused rather than honoured, because a chart with no categories is never what anyone meant and an
// empty plot area is a worse answer than a refusal naming the problem.
function limitStep(table: Table, count: number, category: string): Applied {
  if (!Number.isSafeInteger(count) || count < 1) return { error: `"${count}" is not a number of categories` };
  const index = columnIndex(table, category);
  if (index === -1) return { error: `no column named "${category}" to count categories of` };
  const seen: string[] = [];
  for (const row of table.rows) {
    const value = text(row[index] ?? null);
    if (!seen.includes(value)) seen.push(value);
    if (seen.length === count) break;
  }
  const kept = new Set(seen);
  return { table: { ...table, rows: table.rows.filter((row) => kept.has(text(row[index] ?? null))) } };
}

function applyStep(table: Table, step: VisualizationTransform, category: string): Applied {
  if (step.op === 'filter') return filterStep(table, step);
  if (step.op === 'derive') return deriveStep(table, step.name, step.expression);
  if (step.op === 'sort') return sortStep(table, step.column, step.direction);
  return limitStep(table, step.count, category);
}

// The table a chart is drawn from, and the reason there is not one. Every step is applied to the
// table the step before it produced. A step that finds nothing to keep produces a table with no rows
// rather than failing, because "only 2024" against a 2023-only source is a question with an empty
// answer, not an error.
export function transformed(
  source: Table,
  steps: readonly VisualizationTransform[],
  category: string,
): Applied {
  let table = source;
  for (const step of steps) {
    const applied = applyStep(table, step, category);
    if ('error' in applied) return applied;
    table = applied.table;
  }
  return { table };
}

export function transformSummary(step: VisualizationTransform): string {
  if (step.op === 'derive') return `${step.name} = ${step.expression}`;
  if (step.op === 'sort') return `sorted by ${step.column} ${step.direction === 'desc' ? 'largest first' : 'in order'}`;
  if (step.op === 'limit') return `the first ${step.count} categories`;
  const values = step.values ?? [step.value ?? ''];
  return `only ${step.column} ${step.compare} ${values.map((value) => `'${text(value)}'`).join(' or ')}`;
}
