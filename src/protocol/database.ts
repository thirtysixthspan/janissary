// Database-browser wire types, composed into the shared contract by ../protocol.ts.
//
// The browser reaches the SQLite registry only through the `databases` plugin topic, so everything
// here is data a client reads and intent payloads it sends — never a statement. Filter values cross
// as text and are bound on the server; a row crosses as an opaque `key` the server minted and the
// client cannot construct, which is what makes a write address exactly one row it was handed.

export type DatabaseRefView = {
  name: string;
  // Whether a `<name>.sqlite` file exists, and whether a connection is currently open. A database
  // on disk but never opened is the case every surface has missed until now.
  exists: boolean;
  open: boolean;
};

export type DatabaseObjectKind = 'table' | 'view' | 'index' | 'trigger';

// What a column's foreign key points at, as `PRAGMA foreign_key_list` reports it. The target column
// is the one matching `columns[index]`; a composite key has several, and an empty string means the
// referenced table's own key could not be resolved, which the grid treats as a reference it cannot
// follow rather than one it would follow wrongly.
export type ForeignKey = {
  table: string;
  columns: string[];
};

export type DatabaseColumnView = {
  name: string;
  // The declared type as written in the schema, which SQLite treats as a hint rather than a type.
  type: string;
  notNull: boolean;
  // `PRAGMA table_info`'s per-column ordinal: 0 for a non-key column, 1..n across a composite key.
  pk: number;
  // Absent for a column that is not a foreign key.
  references?: ForeignKey;
};

export type DatabaseObjectView = {
  name: string;
  kind: DatabaseObjectKind;
  columns: DatabaseColumnView[];
  // A view is always read-only and a table is read-only without a primary key, so the grid offers no
  // write control rather than offering one that would be refused.
  writable: boolean;
};

export type DatabaseCellView = {
  text: string;
  // A null and an empty string are different values, and a grid that draws both as a blank cell has
  // lost one of them.
  isNull: boolean;
};

export type DatabaseRowView = {
  // Opaque and server-minted. It resolves to a primary key only on the server, and only for a page
  // the server still holds.
  key: string;
  cells: DatabaseCellView[];
};

export type DatabaseFilterOperator =
  | 'contains' | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'isNull' | 'notNull';

export type DatabaseFilterView = {
  // A column of the selected object, as the server's own schema read it.
  column: string;
  op: DatabaseFilterOperator;
  // Absent for `isNull` and `notNull`, which bind nothing.
  value?: string;
};

export type DatabaseOrderView = {
  column: string;
  desc: boolean;
};

export type DatabaseGridQuery = {
  object: string;
  filters: DatabaseFilterView[];
  // One term matched against every column of the object at once, so a value can be looked for
  // without knowing which column holds it. Empty means no such term.
  global: string;
  order: DatabaseOrderView[];
  limit: number;
  offset: number;
};

export type DatabaseGridView = {
  // The exact statement that ran, with `?` where a value was bound, and those values in order.
  // Never an inlined rendering: a value containing a quote cannot be shown inside one safely.
  sql: string;
  parameters: (string | number)[];
  columns: string[];
  rows: DatabaseRowView[];
  // Rows matching the filters, and rows in the object regardless of them. The second is what tells a
  // user their filter is narrowing something, rather than that the table is small.
  total: number;
  unfilteredTotal: number;
  offset: number;
  limit: number;
  // The order actually used, including the primary-key fallback applied when none was chosen.
  order: DatabaseOrderView[];
  // The console's own ceiling cut this result short, so the rows are the first of more rather than
  // all of them. Absent for a page of an object, which is a count and not a cut.
  truncated?: boolean;
  // The rows carry no row identity, because the statement was not about one object and the server
  // had no row to mint one for. Absent for a page of an object, which a write can address.
  keyless?: boolean;
};

/** A statement's result as a notification carries it, and a file for it when it is too long for that. */
export type DatabaseStatementReport = {
  text: string;
  /** Absolute path of a file holding every row, present only when `text` is a shortening. */
  file?: string;
};

export type DatabaseResultView =
  | {
    kind: 'schema';
    requestId: string;
    database: string;
    objects: DatabaseObjectView[];
    error?: string;
  }
  | {
    kind: 'query';
    requestId: string;
    database: string;
    grid: DatabaseGridView;
    /**
     * What the statement produced, said where a user will read it rather than in the grid: the whole
     * result as `text` when it is short enough for one line, and the first `REPORT_LINE_BUDGET` lines
     * of it plus a `file` holding every row when it is not. The grid is a page and the report is the
     * result, and neither is derivable from the other.
     */
    report?: DatabaseStatementReport;
    error?: string;
  }
  | {
    kind: 'write';
    requestId: string;
    database: string;
    sql: string;
    // A cell set to SQL NULL binds one, which is why a write's parameters may hold one and a grid
    // query's may not: no filter operator binds null.
    parameters: (string | number | null)[];
    changed: number;
    error?: string;
  }
  | {
    kind: 'export';
    requestId: string;
    database: string;
    path: string;
    name: string;
    size: string;
    rows: number;
    error?: string;
  };

// Everything the host publishes about databases: which ones exist, and the recent answers to the
// requests a plugin has issued against them.
export type DatabasesView = {
  databases: DatabaseRefView[];
  // Most recent first, capped. The cap is what bounds this on the state-broadcast path.
  results: DatabaseResultView[];
  // The open database most recently reached, or null when none is open. Published beside the list
  // rather than by reordering it: the list is what a user picks from and is sorted by name, while
  // this is what a bare `sql` opens, and those are two different questions.
  lastOpened: string | null;
};
