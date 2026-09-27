import type {
  ConversationModelPair,
  VisualizationSummaryView,
  VisualizationWindowView,
} from '../protocol.js';
import { availableConversationModels, hasConversationModel } from '../conversations/view.js';
import { DEFAULT_VISUALIZATION_TITLE, type VisualizationRecord } from './store.js';

export const VISUALIZATION_TITLE_MAX_LENGTH = 60;

// A visualization nobody has named yet reads as `New visualization`, and the first chart the model
// produces renames it — a chart's own title is a far better name than the source's URL, and asking
// the user for one would be a question the model has already answered. A name the user chose is never
// overwritten, for the same reason a renamed conversation keeps its name.
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

// Which question, if any, the tab is waiting on. Derived from the answers rather than stored as a
// pointer, so a record that was written by an older run and has no such field still opens on the
// right question rather than on a stale one.
export function pendingQuestion(record: VisualizationRecord): string | undefined {
  return record.questions.find((entry) => (entry.answer ?? '') === '')?.id;
}

export function interviewComplete(record: VisualizationRecord): boolean {
  return record.questions.length > 0 && pendingQuestion(record) === undefined;
}

export function summaryOf(record: VisualizationRecord): VisualizationSummaryView {
  return { id: record.id, title: record.title, updatedAt: record.updatedAt };
}

export function windowOf(
  record: VisualizationRecord,
  busy: boolean,
  deleted: boolean,
): VisualizationWindowView {
  return {
    id: record.id,
    title: record.title,
    ...(deleted && { deleted: true }),
    source: record.source,
    pair: record.pair,
    refreshSeconds: record.refreshSeconds,
    ...(record.readAt !== undefined && { readAt: record.readAt }),
    questions: record.questions.map((entry) => ({ ...entry })),
    ...(pendingQuestion(record) !== undefined && { pendingQuestionId: pendingQuestion(record) }),
    ...(record.chart !== undefined && { chart: record.chart }),
    ...(record.table !== undefined && { table: record.table }),
    // A copy, because the record's array is the live one the next reply replaces, and a payload that
    // shares it would mutate out from under a tab already holding the old suggestions.
    ...(record.followUps !== undefined && { followUps: [...record.followUps] }),
    turns: record.turns.map((turn) => ({ ...turn })),
    ...(busy && { busy: true }),
    ...(record.error !== undefined && { error: record.error }),
  };
}
