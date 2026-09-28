// Visualizations-domain wire types, composed into the shared contract by ../protocol.ts.
//
// A visualization is a conversation about data. The source is read on the server, what reaches the
// client is tables rather than URLs, and what the model produces is a specification over one of those
// tables rather than code. A visualization holds a list of charts, and each chart names the data it
// draws from and the transformations applied to that data before its marks are built.

import type { ConversationModelPair } from './conversations.js';

export type VisualizationChartKind = 'bar' | 'line' | 'area' | 'scatter' | 'pie';

// How `y` is reduced before the marks are built, where each aggregate runs over the rows sharing a
// category — and, where the chart is split, over the rows of one series within it. `count` counts those
// rows rather than measuring them, which is why it still obeys the rule that a row whose measure is not
// a number is not plotted and so is not counted either.
export type VisualizationAggregate = 'sum' | 'mean' | 'count' | 'min' | 'max';

// Where a chart's data comes from: the visualization's own source, or a file the agent acquired
// inside its own workspace because the source described an API rather than holding values. The path
// is relative to that workspace and the host refuses one that resolves outside it, so a file
// reference is a name the agent chose rather than a path it chose.
export type VisualizationDataRef =
  | { kind: 'source' }
  | { kind: 'file'; path: string };

// A comparison a filter makes in a column's own type: numerically for a number, as an instant for a
// date, as a string for text, against a boolean for a boolean. `contains` is a substring test and
// `in` is a membership test, so those two carry `values` rather than `value`.
export type VisualizationCompare = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in';

export type VisualizationCell = string | number | boolean | null;

export type VisualizationFilter = {
  op: 'filter';
  column: string;
  compare: VisualizationCompare;
  value?: VisualizationCell;
  values?: VisualizationCell[];
};

// A new numeric column computed from an arithmetic expression over the columns already there, which
// is how "revenue per employee" and "margin as a share of revenue" are asked for without a formula
// language: numbers, column names, `+ - * /`, unary minus, and parentheses.
export type VisualizationDerive = { op: 'derive'; name: string; expression: string };

export type VisualizationSort = { op: 'sort'; column: string; direction: 'asc' | 'desc' };

// The first `count` distinct values of the chart's own x column, in the order a preceding `sort` left
// them. Counted in categories rather than rows so a split chart loses a whole bar or line rather than
// one of a category's series, which would leave a mark a different height from its neighbour.
export type VisualizationLimit = { op: 'limit'; count: number };

export type VisualizationTransform =
  | VisualizationFilter
  | VisualizationDerive
  | VisualizationSort
  | VisualizationLimit;

// `date` is a column every value of which is an ISO 8601 date the calendar agrees with, and nothing
// else. It is not a measure, so it cannot be plotted against; it is a category whose order is its
// order, which is what makes a time series read as one.
export type VisualizationColumnType = 'number' | 'boolean' | 'string' | 'date';

export type VisualizationColumnView = {
  name: string;
  type: VisualizationColumnType;
};

export type VisualizationTableView = {
  columns: VisualizationColumnView[];
  // Every cell is a string, a number, a boolean, or null, and a number is always finite. The client
  // narrows on the column's declared type rather than on the value.
  rows: VisualizationCell[][];
  // How many rows there are of the table this one is, which is larger than `rows.length` when the
  // payload was capped. The client says so rather than implying the chart is the whole source.
  total: number;
  truncated: boolean;
};

// What a server-side dataset holds. The key is `source` for the visualization's own source and the
// file's relative path otherwise, and the table is the raw one — a chart's own table is the result of
// applying its transformations to this, never this itself. `document` is the fetched text kept only
// when the body is a page rather than a table, and it never reaches the wire: it is what the model is
// shown so it can work out how to reach the data, not something a tab renders.
export type VisualizationDatasetView = {
  key: string;
  table?: VisualizationTableView;
  document?: string;
  readAt?: number;
  error?: string;
};

// The one thing the model decides: which mark, over which columns, from which data, called what.
// Everything the client draws follows from these fields, which is what lets a reply be checked
// against the real table before it is shown.
export type ChartShape = {
  kind: VisualizationChartKind;
  // The category or x-axis column, and the measure plotted against it. Both must name real columns
  // of the table below, and `y` must be numeric.
  x: string;
  y: string;
  // An optional third column whose distinct values split the marks into one bar or line each. Absent
  // means a single series.
  series?: string;
  // An optional reduction of `y` within each category, so a source whose grain is finer than the
  // question — one row per transaction rather than one per region — can be charted at all. Absent
  // means every row is its own mark. A pie sums when it is absent, because that is what a pie is.
  aggregate?: VisualizationAggregate;
  title: string;
  xLabel?: string;
  yLabel?: string;
};

// A specification plus where its data comes from and what is done to that data first. This is the
// value a model's reply states and the value a stored chart keeps, and it never reaches the browser.
export type ChartSpec = ChartShape & {
  data: VisualizationDataRef;
  transforms: VisualizationTransform[];
};

// What the browser is shown. The transformations are gone and `notes` has taken their place, because a
// chart's transformations reach a reader as a sentence under the picture and as nothing else — the
// client never applies them, and re-declaring a four-step grammar plus its guards in the import-free
// contract purely to render six words is the kind of mirroring that produces drift. The server
// composes the words once, in `chart-spec.ts`, and both the caption and the sentence a chart leaves
// behind when the model changed it without explaining itself are built from the same call.
export type VisualizationChartView = ChartShape & {
  id: string;
  data: VisualizationDataRef;
  // One clause per transformation, in the order they are applied, for the caption under the chart.
  notes: string[];
  // Seconds between re-reads of this chart's data, where 0 means the data is read once and left
  // alone. It is per chart rather than per visualization because live update is attached to individual
  // graphs.
  refreshSeconds: number;
  // When this chart's data was last read, and the reason the last read failed. Both are copied from
  // the dataset at projection time so a chart can describe itself without looking anything up.
  readAt?: number;
  error?: string;
  // The table this chart's transformations produced, which is what its marks are built from. It is
  // resolved on the server and stored rather than re-derived per broadcast, because the whole view
  // is re-sent on essentially every mutation.
  table: VisualizationTableView;
};

// A stored chart is the specification a chart is drawn from plus the state only the host knows. The
// resolved table is held rather than re-derived, for the reason the wire field's comment gives.
export type VisualizationChartRecord = ChartSpec & {
  id: string;
  refreshSeconds: number;
  readAt?: number;
  error?: string;
  table: VisualizationTableView;
};

// A modification query and the model's reply, the same shape a conversation turn has, because a
// visualization's chat is a conversation about its charts.
export type VisualizationTurnView = {
  query: string;
  response: string;
  pair: ConversationModelPair;
  streaming?: boolean;
};

export type VisualizationSummaryView = {
  id: string;
  title: string;
  updatedAt: number;
};

export type VisualizationWindowView = {
  id: string;
  title: string;
  deleted?: boolean;
  // The most recent address the user named, which is what the tab's metadata row shows. A second
  // address supersedes it rather than being refused, because pointing somewhere else is a normal
  // thing to do mid-conversation.
  source: string;
  pair: ConversationModelPair;
  charts: VisualizationChartView[];
  // Two to four requests the model offered about what it has just said or drawn, shown as one-click
  // modifications and replaced by whichever reply comes next.
  followUps?: string[];
  turns: VisualizationTurnView[];
  // A call in flight: the read of a new source, or the model call that follows it. What it is for is
  // the tab's business — the tab renders one busy state for all of them.
  busy?: boolean;
  // The last thing that went wrong, kept on the record so a tab opened later still shows it.
  error?: string;
};

export type VisualizationsView = {
  summaries: VisualizationSummaryView[];
  windows: VisualizationWindowView[];
  models: ConversationModelPair[];
};
