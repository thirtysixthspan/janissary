import type {
  SqlCell,
  SqlFilter,
  SqlGrid,
  SqlObject,
  SqlPayload,
  SqlRow,
} from '@shared/plugins/sql/shared';

// Pure view arithmetic, kept out of the components so it is testable without a render: where a page
// starts and ends, what the pager says, what a filter chip reads, and what a cell shows.

/**
 * `Rows 1–100 of 4,213`, with the object's own total beside it once a filter is narrowing.
 *
 * A result the console cut off is the one case that reports no total at all, because a total is the
 * claim it cannot make: the rows are the first of more, and naming the ceiling as the size is what
 * makes a truncated read look like a small one. It reads as how many there are and that there are
 * more, and the pager's **Next** stays disabled either way — a console result is one iterator taken
 * once, with no second page behind it.
 */
export function pageLabel(grid: SqlGrid): string {
  if (grid.rows.length === 0) return 'No rows.';
  if (grid.truncated) {
    const shown = grid.rows.length.toLocaleString('en-US');
    return `First ${shown} rows of more than ${shown}.`;
  }
  const first = grid.offset + 1;
  const last = grid.offset + grid.rows.length;
  const total = grid.total === grid.unfilteredTotal
    ? `${grid.total.toLocaleString('en-US')} row${grid.total === 1 ? '' : 's'}`
    : `${grid.total.toLocaleString('en-US')} of ${grid.unfilteredTotal.toLocaleString('en-US')} rows`;
  return `Rows ${first.toLocaleString('en-US')}–${last.toLocaleString('en-US')} of ${total}`;
}

/**
 * What the grid's header reports about how much of the object is there.
 *
 * A page, once one has been read. Before that a bare "no grid" stands for two different states that
 * have to be told apart: a request the tab is still waiting on, and a schema read that landed with
 * nothing in it. The payload holds them apart already — `pending` is the outstanding request, and
 * nothing pending against an empty object list is a read that finished — so the label is a question
 * about the payload rather than about the grid. `Loading…` answers the remaining case, a tab that
 * has read nothing and is not waiting on anything, which is what it read before this existed.
 */
export function countLabel(payload: SqlPayload): string {
  if (payload.grid) return pageLabel(payload.grid);
  if (payload.pending !== null) return 'Loading…';
  return payload.objects.length === 0 ? 'No tables.' : 'Loading…';
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

/** One cell of a selection: which row of the page it is in, and which column's cell. */
export type CellPosition = { row: number; cell: number };

/** A selection: a rectangle anchored where the run started, reaching wherever it got to. */
export type CellRange = { from: CellPosition; to: CellPosition };

/**
 * The selection as tab-separated text, one line per row of the run.
 *
 * Tab-separated rather than CSV because a spreadsheet pastes it as a table with no quoting rules to
 * disagree about, and a value containing a comma or a quote cannot change the shape of what is
 * copied. Each value is read through `cellText`, so a null reads as `NULL` exactly as the grid shows
 * it rather than as an empty cell the paste would turn back into a string. A selection read outside
 * the page — a range the user cannot see because it runs off the end — is skipped rather than
 * invented, so what is copied is only what was on screen.
 */
export function selectionToTsv(
  rows: readonly SqlRow[],
  columns: readonly string[],
  from: CellPosition,
  to: CellPosition,
): string {
  const firstRow = Math.max(0, Math.min(from.row, to.row));
  const lastRow = Math.min(rows.length - 1, Math.max(from.row, to.row));
  const firstCell = Math.max(0, Math.min(from.cell, to.cell));
  const lastCell = Math.min(columns.length - 1, Math.max(from.cell, to.cell));
  if (lastRow < firstRow || lastCell < firstCell) return '';
  const lines: string[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    const cells: string[] = [];
    for (let cell = firstCell; cell <= lastCell; cell += 1) {
      cells.push(cellText(rows[row]?.cells[cell] ?? { text: '', isNull: true }));
    }
    lines.push(cells.join('\t'));
  }
  return lines.join('\n');
}

/**
 * The selection a second click or a shift-click extends: a rectangle from the cell the run started
 * at to the cell it reached, whichever way round that is. Dragging up and left selects the same
 * rectangle as dragging down and right, because a run of cells has no direction.
 */
export function selectionTo(anchor: CellPosition, reached: CellPosition): CellRange {
  return {
    from: { row: Math.min(anchor.row, reached.row), cell: Math.min(anchor.cell, reached.cell) },
    to: { row: Math.max(anchor.row, reached.row), cell: Math.max(anchor.cell, reached.cell) },
  };
}

/**
 * The selection a row's own header makes: that row, every visible column of it.
 *
 * A whole row is the widest run the grid has, so it always spans from the first visible column —
 * including when it extends a run that started at one cell, because a key held with an arrow is a
 * request for rows and not for a column. Extending keeps the row the run started from and gains
 * rows. `lastColumn` is the last visible column rather than the last of the row's cells, so a hidden
 * column does not leave an empty cell at the end of a copied row.
 */
export function rowRange(row: number, lastColumn: number, from: CellRange | null): CellRange {
  return selectionTo({ row: from?.from.row ?? row, cell: 0 }, { row, cell: lastColumn });
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

/**
 * Whether this grid is a statement's result rather than a page of an object, and so carries no row a
 * write can address.
 *
 * A statement the user typed is not necessarily about one object, so the server had no row to mint an
 * identity for and every row arrived with an empty one. `editing?.row === row.key` matches those all
 * at once, which is how a single double-click opened an editor in every row and the first blur sent a
 * write that could only be refused.
 */
export function statementResult(grid: SqlGrid | null): boolean {
  return grid?.keyless === true;
}

export function readOnlyReason(object: SqlObject | undefined, statement = false): string | null {
  if (statement) return "Read-only: this is a statement's result, not a table.";
  if (!object) return null;
  if (object.kind === 'view') return `Read-only: "${object.name}" is a view.`;
  if (!object.writable) return `Read-only: "${object.name}" has no primary key.`;
  return null;
}

export function columnCount(object: SqlObject): string {
  return `${object.columns.length} col${object.columns.length === 1 ? '' : 's'}`;
}


