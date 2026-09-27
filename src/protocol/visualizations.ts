// Visualizations-domain wire types, composed into the shared contract by ../protocol.ts.
//
// A visualization is one data source plus one chart specification the model produced from it. The
// source is fetched and parsed on the server, so what reaches the client is a table rather than a
// URL, and what the model produces is a specification over that table rather than code.

import type { ConversationModelPair } from './conversations.js';

export type VisualizationChartKind = 'bar' | 'line' | 'area' | 'scatter' | 'pie';

// How `y` is reduced before the marks are built, where each aggregate runs over the rows sharing a
// category — and, where the chart is split, over the rows of one series within it. `count` counts those
// rows rather than measuring them, which is why it still obeys the rule that a row whose measure is not
// a number is not plotted and so is not counted either.
export type VisualizationAggregate = 'sum' | 'mean' | 'count' | 'min' | 'max';

// The one thing the model decides: which mark, over which columns, called what. Everything the
// client draws follows from these fields, which is what lets a reply be checked against the real
// columns before it is shown.
export type VisualizationChartView = {
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
  rows: (string | number | boolean | null)[][];
  // How many rows the source actually had, which is larger than `rows.length` when the payload was
  // capped. The client says so rather than implying the chart is the whole source.
  total: number;
  truncated: boolean;
};

// One question the model asked, and the answer the user gave it. `answer` is absent until then, so
// the tab knows whether it is asking or showing.
export type VisualizationQuestionView = {
  id: string;
  question: string;
  suggestions: string[];
  answer?: string;
};

// A modification query and the model's reply, the same shape a conversation turn has, because a
// visualization's chat is a conversation about its chart.
export type VisualizationTurnView = {
  query: string;
  response: string;
  pair: ConversationModelPair;
  error?: string;
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
  source: string;
  pair: ConversationModelPair;
  // Seconds between re-reads of the source, where 0 means the source is read once and left alone.
  refreshSeconds: number;
  // When the table was last read from the source, absent until a read has succeeded.
  readAt?: number;
  // Whether the user has confirmed the columns the parser inferred. A tab holding a table, no chart, no
  // questions, and this false is showing those columns and waiting.
  reviewed: boolean;
  questions: VisualizationQuestionView[];
  // The question awaiting an answer. Absent once the interview is over, which is not the same as a
  // chart existing: a model that asked nothing leaves both absent.
  pendingQuestionId?: string;
  chart?: VisualizationChartView;
  table?: VisualizationTableView;
  // Two to four questions the model offered about the chart it has just produced, shown as one-click
  // modifications and replaced by whichever reply comes next.
  followUps?: string[];
  turns: VisualizationTurnView[];
  // A call in flight: the opening one, the one that closes the interview, or a modification. What it
  // is for is the tab's business — the tab renders one busy state for all of them.
  busy?: boolean;
  // The last thing that went wrong, kept on the record so a tab opened later still shows it.
  error?: string;
};

export type VisualizationsView = {
  summaries: VisualizationSummaryView[];
  windows: VisualizationWindowView[];
  models: ConversationModelPair[];
};
