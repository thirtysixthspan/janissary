// The visualizations plugin's tab payload and intent contracts.
//
// Import-free by rule: the client executes these guards through `@shared`, and an import here could
// pull NodeNext resolution or server behavior into the browser graph. The view shapes are therefore
// re-declared rather than imported, exactly as every other bundled plugin's shared contract does, and
// `shared.test.ts` pins them against the protocol types the host ships — including the three grammar
// guards below, which are the same rules `src/visualizations/chart-spec.ts` owns on the server.

export const VISUALIZATIONS_PAYLOAD_SCHEMA_VERSION = 2;

export type ConversationModelPair = { harness: 'claude' | 'opencode'; model: string };

export type VisualizationSummary = { id: string; title: string; updatedAt: number };

export type VisualizationChartKind = 'bar' | 'line' | 'area' | 'scatter' | 'pie';

export type VisualizationAggregate = 'sum' | 'mean' | 'count' | 'min' | 'max';

export type VisualizationCell = string | number | boolean | null;

// Where a chart draws from: the source the user pointed at, or a file the agent acquired inside its own
// workspace. The grammar of what may be done to that data does not appear here — it reaches the browser
// as `notes`, one clause per transformation, composed once on the server.
export type VisualizationDataRef = { kind: 'source' } | { kind: 'file'; path: string };

export type VisualizationColumn = { name: string; type: 'number' | 'boolean' | 'string' | 'date' };

export type VisualizationTable = {
  columns: VisualizationColumn[];
  rows: VisualizationCell[][];
  total: number;
  truncated: boolean;
};

export type VisualizationChart = {
  id: string;
  data: VisualizationDataRef;
  notes: string[];
  refreshSeconds: number;
  readAt?: number;
  error?: string;
  table: VisualizationTable;
  kind: VisualizationChartKind;
  x: string;
  y: string;
  series?: string;
  aggregate?: VisualizationAggregate;
  title: string;
  xLabel?: string;
  yLabel?: string;
};

export type VisualizationTurn = {
  query: string;
  response: string;
  pair: ConversationModelPair;
  error?: string;
  streaming?: boolean;
};

export type VisualizationWindow = {
  id: string;
  title: string;
  deleted?: boolean;
  source: string;
  pair: ConversationModelPair;
  charts: VisualizationChart[];
  followUps?: string[];
  turns: VisualizationTurn[];
  busy?: boolean;
  error?: string;
};

export type VisualizationsData = {
  summaries: VisualizationSummary[];
  windows: VisualizationWindow[];
  models: ConversationModelPair[];
};

export type VisualizationListPayload = { kind: 'list'; entries: VisualizationSummary[] };

export type VisualizationTabPayload = {
  kind: 'visualization';
  window: VisualizationWindow;
  models: ConversationModelPair[];
};

export type VisualizationsPayload = VisualizationListPayload | VisualizationTabPayload;

export type CreateIntent = { source?: string; message?: string };
export type IdIntent = { id: string };
export type SendIntent = { query: string };
export type ChartIntent = { chartId: string };
export type ChartRefreshIntent = { chartId: string; seconds: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isModelPair(value: unknown): value is ConversationModelPair {
  return isRecord(value)
    && (value.harness === 'claude' || value.harness === 'opencode')
    && typeof value.model === 'string';
}

function isSummary(value: unknown): value is VisualizationSummary {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && typeof value.updatedAt === 'number';
}

const CHART_KINDS = new Set<string>(['bar', 'line', 'area', 'scatter', 'pie']);
const AGGREGATES = new Set<string>(['sum', 'mean', 'count', 'min', 'max']);

function isDataRef(value: unknown): value is VisualizationDataRef {
  if (!isRecord(value)) return false;
  if (value.kind === 'source') return Object.keys(value).length === 1;
  return value.kind === 'file' && typeof value.path === 'string' && value.path !== '';
}

function isColumn(value: unknown): value is VisualizationColumn {
  return isRecord(value) && typeof value.name === 'string' && typeof value.type === 'string';
}

function isTable(value: unknown): value is VisualizationTable {
  return isRecord(value)
    && Array.isArray(value.columns) && value.columns.every((column) => isColumn(column))
    && Array.isArray(value.rows)
    && typeof value.total === 'number'
    && typeof value.truncated === 'boolean';
}

function isChart(value: unknown): value is VisualizationChart {
  return isRecord(value)
    && typeof value.id === 'string' && value.id !== ''
    && isDataRef(value.data)
    && Array.isArray(value.notes) && value.notes.every((note) => typeof note === 'string')
    && typeof value.refreshSeconds === 'number'
    && (value.readAt === undefined || typeof value.readAt === 'number')
    && (value.error === undefined || typeof value.error === 'string')
    && isTable(value.table)
    && typeof value.kind === 'string' && CHART_KINDS.has(value.kind)
    && typeof value.x === 'string'
    && typeof value.y === 'string'
    && typeof value.title === 'string'
    && (value.series === undefined || typeof value.series === 'string')
    && (value.aggregate === undefined || (typeof value.aggregate === 'string' && AGGREGATES.has(value.aggregate)))
    && (value.xLabel === undefined || typeof value.xLabel === 'string')
    && (value.yLabel === undefined || typeof value.yLabel === 'string');
}

function isTurn(value: unknown): value is VisualizationTurn {
  return isRecord(value)
    && typeof value.query === 'string'
    && typeof value.response === 'string'
    && isModelPair(value.pair)
    && (value.error === undefined || typeof value.error === 'string')
    && value.streaming === undefined;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

export function isVisualizationWindow(value: unknown): value is VisualizationWindow {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && (value.deleted === undefined || typeof value.deleted === 'boolean')
    && typeof value.source === 'string'
    && isModelPair(value.pair)
    && Array.isArray(value.charts) && value.charts.every((chart) => isChart(chart))
    && (value.followUps === undefined || isStringList(value.followUps))
    && Array.isArray(value.turns) && value.turns.every((turn) => isTurn(turn))
    && (value.busy === undefined || typeof value.busy === 'boolean')
    && (value.error === undefined || typeof value.error === 'string');
}

export function isVisualizationsData(value: unknown): value is VisualizationsData {
  return isRecord(value)
    && Array.isArray(value.summaries) && value.summaries.every((entry) => isSummary(entry))
    && Array.isArray(value.windows) && value.windows.every((entry) => isVisualizationWindow(entry))
    && Array.isArray(value.models) && value.models.every((entry) => isModelPair(entry));
}

export function isVisualizationsPayload(value: unknown): value is VisualizationsPayload {
  if (!isRecord(value)) return false;
  if (value.kind === 'list') {
    return Array.isArray(value.entries) && value.entries.every((entry) => isSummary(entry));
  }
  if (value.kind === 'visualization') {
    return isVisualizationWindow(value.window) && Array.isArray(value.models)
      && value.models.every((entry) => isModelPair(entry));
  }
  return false;
}

export function isCreateIntent(value: unknown): value is CreateIntent {
  if (!isRecord(value)) return false;
  const message = value.message;
  const source = value.source;
  return (message === undefined || (typeof message === 'string' && message.trim() !== ''))
    && (source === undefined || (typeof source === 'string' && source.trim() !== ''));
}

export function isIdIntent(value: unknown): value is IdIntent {
  return isRecord(value) && typeof value.id === 'string' && value.id !== '';
}

export function isSendIntent(value: unknown): value is SendIntent {
  return isRecord(value) && typeof value.query === 'string' && value.query.trim() !== '';
}

export function isChartIntent(value: unknown): value is ChartIntent {
  return isRecord(value) && typeof value.chartId === 'string' && value.chartId !== '';
}

export function isChartRefreshIntent(value: unknown): value is ChartRefreshIntent {
  return isRecord(value)
    && typeof value.chartId === 'string' && value.chartId !== ''
    && typeof value.seconds === 'number' && Number.isFinite(value.seconds) && value.seconds >= 0;
}
