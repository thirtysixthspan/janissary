import type {
  ConversationModelPair,
  VisualizationSummaryView,
  VisualizationTurnView,
  VisualizationWindowView,
} from '../protocol.js';
import { availableConversationModels, hasConversationModel } from '../conversations/view.js';
import { chartViewOf } from './charts.js';
import { DEFAULT_VISUALIZATION_TITLE, type VisualizationRecord } from './store.js';

export const VISUALIZATION_TITLE_MAX_LENGTH = 60;

// A visualization nobody has named yet reads as `New visualization`, and the first chart the model
// produces renames it — a chart's own title is a far better name than the source's URL, and asking
// the user for one would be a question the model has already answered. A name the model gave — because
// the user asked in chat for the visualization to be called something — is never overwritten, for the
// same reason a renamed conversation keeps its name.
export function visualizationTitle(chartTitle: string): string {
  const first = chartTitle.split('\n', 1)[0]?.trim() ?? '';
  return first === '' ? DEFAULT_VISUALIZATION_TITLE : first.slice(0, VISUALIZATION_TITLE_MAX_LENGTH);
}

export function isUntitled(record: VisualizationRecord): boolean {
  return record.title === DEFAULT_VISUALIZATION_TITLE;
}

export function titled(title: string): string {
  const trimmed = title.trim();
  return trimmed === ''
    ? ''
    : trimmed.slice(0, VISUALIZATION_TITLE_MAX_LENGTH);
}

export function availableVisualizationModels(): ConversationModelPair[] {
  return availableConversationModels();
}

export function usablePair(pair: ConversationModelPair): ConversationModelPair {
  return hasConversationModel(pair) ? pair : (availableConversationModels()[0] ?? pair);
}

export function summaryOf(record: VisualizationRecord): VisualizationSummaryView {
  return { id: record.id, title: record.title, updatedAt: record.updatedAt };
}

// A turn as the browser sees it: the copy a revert restores is the host's business and does not travel,
// because a browser holding the chart list of every one of the last twelve turns is holding a record it
// has no use for.
function shownTurn(turn: VisualizationTurnView): VisualizationTurnView {
  const shown: VisualizationTurnView = { ...turn };
  delete shown.before;
  return shown;
}

export function windowOf(
  record: VisualizationRecord,
  busy: boolean,
  deleted: boolean,
): VisualizationWindowView {
  // The source's last read failure is the tab's error, because before there is a chart that read is the
  // only thing that happened — and a source that 500s with nothing on screen and no reason given is a
  // tab that looks broken with nothing to explain it.
  const failure = record.error ?? record.datasets.find((dataset) => dataset.key === 'source')?.error;
  return {
    id: record.id,
    title: record.title,
    ...(deleted && { deleted: true }),
    source: record.source,
    pair: record.pair,
    charts: record.charts.map((chart) => chartViewOf(chart)),
    // A copy, because the record's array is the live one the next reply replaces, and a payload that
    // shares it would mutate out from under a tab already holding the old suggestions.
    ...(record.followUps !== undefined && { followUps: [...record.followUps] }),
    notices: [...(record.notices ?? [])],
    instructions: [...(record.instructions ?? [])],
    ...(record.clarify !== undefined && { clarify: { ...record.clarify, options: [...record.clarify.options] } }),
    // The copy a revert restores is the host's business and does not travel: a browser holding the chart
    // list of every one of the last twelve turns is holding a record it has no use for.
    turns: record.turns.map((turn) => shownTurn(turn)),
    ...(busy && { busy: true }),
    ...(failure !== undefined && { error: failure }),
  };
}
