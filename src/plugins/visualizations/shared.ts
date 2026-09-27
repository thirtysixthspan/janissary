// The visualizations plugin's tab payload and intent contracts.
//
// Import-free by rule: the client executes these guards through `@shared`, and an import here could
// pull NodeNext resolution or server behavior into the browser graph. The view shapes are therefore
// re-declared rather than imported, exactly as every other bundled plugin's shared contract does, and
// `shared.test.ts` pins them against the protocol types the host ships.

export const VISUALIZATIONS_PAYLOAD_SCHEMA_VERSION = 1;

export type ConversationModelPair = { harness: 'claude' | 'opencode'; model: string };

export type VisualizationSummary = { id: string; title: string; updatedAt: number };

export type VisualizationAggregate = 'sum' | 'mean' | 'count' | 'min' | 'max';

export type VisualizationChart = {
  kind: 'bar' | 'line' | 'area' | 'scatter' | 'pie';
  x: string;
  y: string;
  series?: string;
  aggregate?: VisualizationAggregate;
  title: string;
  xLabel?: string;
  yLabel?: string;
};

export type VisualizationColumnType = 'number' | 'boolean' | 'string' | 'date';

export type VisualizationColumn = { name: string; type: VisualizationColumnType };

export type VisualizationTable = {
  columns: VisualizationColumn[];
  rows: (string | number | boolean | null)[][];
  total: number;
  truncated: boolean;
};

export type VisualizationQuestion = {
  id: string;
  question: string;
  suggestions: string[];
  answer?: string;
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
  refreshSeconds: number;
  readAt?: number;
  reviewed: boolean;
  questions: VisualizationQuestion[];
  pendingQuestionId?: string;
  chart?: VisualizationChart;
  table?: VisualizationTable;
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

export type CreateIntent = { source: string };
export type IdIntent = { id: string };
export type TitleIntent = { title: string };
export type SourceIntent = { source: string };
export type SelectModelIntent = { harness: 'claude' | 'opencode'; model: string };
export type AnswerIntent = { questionId: string; answer: string };
export type SendIntent = { query: string };
export type RefreshIntent = { seconds: number };

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

const CHART_KINDS = new Set(['bar', 'line', 'area', 'scatter', 'pie']);
const AGGREGATES = new Set(['sum', 'mean', 'count', 'min', 'max']);

function isChart(value: unknown): value is VisualizationChart {
  return isRecord(value)
    && typeof value.kind === 'string' && CHART_KINDS.has(value.kind)
    && typeof value.x === 'string'
    && typeof value.y === 'string'
    && typeof value.title === 'string'
    && (value.series === undefined || typeof value.series === 'string')
    && (value.aggregate === undefined || (typeof value.aggregate === 'string' && AGGREGATES.has(value.aggregate)))
    && (value.xLabel === undefined || typeof value.xLabel === 'string')
    && (value.yLabel === undefined || typeof value.yLabel === 'string');
}

// The four declared types, exported because two places need to agree on them: the guard that checks a
// column, and the intent that corrects one. A fifth is refused at the boundary rather than reaching the
// host, which is the only place that could act on it anyway.
export const COLUMN_TYPES: readonly VisualizationColumnType[] = ['number', 'boolean', 'string', 'date'];

function isColumn(value: unknown): value is VisualizationColumn {
  return isRecord(value)
    && typeof value.name === 'string'
    && (COLUMN_TYPES as readonly string[]).includes(value.type as string);
}

function isTable(value: unknown): value is VisualizationTable {
  return isRecord(value)
    && Array.isArray(value.columns) && value.columns.every(isColumn)
    && Array.isArray(value.rows)
    && typeof value.total === 'number'
    && typeof value.truncated === 'boolean';
}

function isQuestion(value: unknown): value is VisualizationQuestion {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.question === 'string'
    && Array.isArray(value.suggestions)
    && value.suggestions.every((entry) => typeof entry === 'string')
    && (value.answer === undefined || typeof value.answer === 'string');
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isTurn(value: unknown): value is VisualizationTurn {
  return isRecord(value)
    && typeof value.query === 'string'
    && typeof value.response === 'string'
    && isModelPair(value.pair)
    && (value.error === undefined || typeof value.error === 'string')
    && value.streaming === undefined;
}

export function isVisualizationWindow(value: unknown): value is VisualizationWindow {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.title === 'string'
    && (value.deleted === undefined || typeof value.deleted === 'boolean')
    && typeof value.source === 'string'
    && isModelPair(value.pair)
    && typeof value.refreshSeconds === 'number'
    && (value.readAt === undefined || typeof value.readAt === 'number')
    && typeof value.reviewed === 'boolean'
    && Array.isArray(value.questions) && value.questions.every(isQuestion)
    && (value.pendingQuestionId === undefined || typeof value.pendingQuestionId === 'string')
    && (value.chart === undefined || isChart(value.chart))
    && (value.table === undefined || isTable(value.table))
    && (value.followUps === undefined || isStringList(value.followUps))
    && Array.isArray(value.turns) && value.turns.every(isTurn)
    && (value.busy === undefined || typeof value.busy === 'boolean')
    && (value.error === undefined || typeof value.error === 'string');
}

export function isVisualizationsData(value: unknown): value is VisualizationsData {
  return isRecord(value)
    && Array.isArray(value.summaries) && value.summaries.every(isSummary)
    && Array.isArray(value.windows) && value.windows.every(isVisualizationWindow)
    && Array.isArray(value.models) && value.models.every(isModelPair);
}

export function isVisualizationsPayload(value: unknown): value is VisualizationsPayload {
  if (!isRecord(value)) return false;
  if (value.kind === 'list') {
    return Array.isArray(value.entries) && value.entries.every(isSummary);
  }
  if (value.kind === 'visualization') {
    return isVisualizationWindow(value.window) && Array.isArray(value.models)
      && value.models.every(isModelPair);
  }
  return false;
}

export function isEmptyIntent(value: unknown): value is Record<string, never> {
  return isRecord(value) && Object.keys(value).length === 0;
}

export function isCreateIntent(value: unknown): value is CreateIntent {
  return isRecord(value) && typeof value.source === 'string' && value.source.trim() !== '';
}

export function isIdIntent(value: unknown): value is IdIntent {
  return isRecord(value) && typeof value.id === 'string' && value.id !== '';
}

export function isTitleIntent(value: unknown): value is TitleIntent {
  return isRecord(value) && typeof value.title === 'string';
}

export function isSourceIntent(value: unknown): value is SourceIntent {
  return isRecord(value) && typeof value.source === 'string' && value.source.trim() !== '';
}

export function isSelectModelIntent(value: unknown): value is SelectModelIntent {
  return isModelPair(value);
}

export function isAnswerIntent(value: unknown): value is AnswerIntent {
  return isRecord(value)
    && typeof value.questionId === 'string' && value.questionId !== ''
    && typeof value.answer === 'string' && value.answer.trim() !== '';
}

export function isSendIntent(value: unknown): value is SendIntent {
  return isRecord(value) && typeof value.query === 'string' && value.query.trim() !== '';
}

export function isRefreshIntent(value: unknown): value is RefreshIntent {
  return isRecord(value)
    && typeof value.seconds === 'number'
    && Number.isFinite(value.seconds) && value.seconds >= 0;
}
