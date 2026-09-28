// Taking back what a reply did to the charts.
//
// The model can remove a chart and rewrite every transformation of one it misunderstood, and the only
// recovery was another sentence — which may be refused as a second message while the first is in flight,
// and which the twelve-turn window will eventually forget. A user who has built up a tab of eight charts
// had no way back from one careless turn.
//
// So every turn that changes a chart carries a copy of the list as it stood, and that copy is what a
// revert restores. It is a copy of specifications rather than of data: a restored chart brings its own
// resolved table, which is why nothing here reaches into a dataset and why a snapshot costs what a list
// of specifications costs.
//
// Deepnote's agent offers one control to undo a whole run and Hex shows a per-change diff to keep or
// discard. This is the same guarantee with a copy of a list instead of a diff engine, and it is bounded
// by the same twelve turns the prompt carries: a user who wants back further than that has to re-ask.

import { noticesFor } from './insights.js';
import { drawn, shapeOf } from './charts.js';
import type { VisualizationRecord } from './store.js';
import type { VisualizationChartRecord, VisualizationChartSpec, VisualizationTurnView } from '../protocol.js';

// What a turn changed, in a sentence, read from the two lists rather than recomputed. A label that
// disagreed with what the turn did would be worse than no label at all.
export function summaryOf(
  before: readonly VisualizationChartSpec[],
  after: readonly VisualizationChartRecord[],
): string {
  const was = new Map(before.map((chart) => [chart.id, chart as VisualizationChartRecord]));
  const now = new Map(after.map((chart) => [chart.id, chart]));
  const removed = before.filter((chart) => !now.has(chart.id));
  const added = after.filter((chart) => !was.has(chart.id));
  const altered = after.filter((chart) => {
    const previous = was.get(chart.id);
    return previous !== undefined && !sameChart(previous, chart);
  });
  const said: string[] = [];
  if (removed.length > 0) said.push(`removed ${names(removed)}`);
  if (altered.length > 0) said.push(`changed ${names(altered)}`);
  if (added.length > 0) said.push(`added ${names(added)}`);
  if (said.length === 0) return '';
  return said.join(', ');
}

function names(charts: readonly VisualizationChartSpec[]): string {
  const titles = charts.map((chart) => `"${chart.title}"`);
  const last = titles.at(-1) ?? '';
  return titles.length === 1 ? last : `${titles.slice(0, -1).join(', ')} and ${last}`;
}

// The copy a turn carries: what to draw, and nothing about what was drawn. The resolved table is the
// expensive half — eight charts of 500 rows by 32 columns is megabytes per turn — and a snapshot does not
// need it, because a restored chart re-resolves against the record's datasets and arrives with the marks it
// had. The charts are not mutated by `placed` — a chart is replaced rather than edited — so the list copy
// is all that is needed, and the transforms are copied with it because a caller could hold one.
export function snapshot(charts: readonly VisualizationChartRecord[]): VisualizationChartSpec[] {
  return charts.map((chart) => {
    const specified: Record<string, unknown> = { ...chart, transforms: [...chart.transforms] };
    delete specified.table;
    delete specified.readAt;
    delete specified.error;
    return specified as VisualizationChartSpec;
  });
}

// Whether a revert is possible at all: a turn with nothing to take back, and a turn already taken back,
// are the same state, and both should refuse rather than restore a second time.
export function restorable(turn: { before?: VisualizationChartSpec[]; undo?: string } | undefined): boolean {
  return turn !== undefined && turn.before !== undefined && turn.undo !== undefined;
}

// Two charts are the same chart when drawing one from them would give the same picture. The title is
// deliberately not compared — "just change the title" is a change the user asked for, and taking it back
// would be tedious.
function sameChart(one: VisualizationChartRecord, other: VisualizationChartRecord): boolean {
  return one.kind === other.kind
    && one.x === other.x
    && one.y === other.y
    && one.series === other.series
    && one.aggregate === other.aggregate
    && one.percentile === other.percentile
    && one.xUnit === other.xUnit
    && one.stack === other.stack
    && one.refreshSeconds === other.refreshSeconds
    && JSON.stringify(one.transforms) === JSON.stringify(other.transforms)
    && sameData(one.data, other.data);
}

function sameData(one: VisualizationChartRecord['data'], other: VisualizationChartRecord['data']): boolean {
  if (one.kind === 'source') return other.kind === 'source';
  return other.kind === 'file' && one.path === other.path;
}

// What a turn did, in words and in a copy — or nothing at all when it did nothing to the charts. A turn
// that only answered a question carries no snapshot, because a revert of nothing is a button that does
// nothing beside a label claiming something happened.
export function keepUndoable(
  turn: VisualizationTurnView,
  before: readonly VisualizationChartRecord[],
  after: readonly VisualizationChartRecord[],
): void {
  const said = summaryOf(snapshot(before), after);
  if (said === '') return;
  turn.undo = said;
  turn.before = snapshot(before);
}

// One turn taken back, and whether it was. The turn is named by the query the user sent in it rather than
// by a position, because a position moves as the conversation grows and the user is looking at a sentence.
// A query the record does not hold, or one already taken back, changes nothing and says so by returning
// false: a revert that quietly did nothing is worse than one that said it could not.
export function reverted(record: VisualizationRecord, query: string): boolean {
  const turn = record.turns.find((one) => one.query === query);
  if (!restorable(turn)) return false;
  // Re-resolved rather than restored verbatim, so a restored chart is drawn from the data its own
  // specification names rather than from a copy of a table that has been re-read since.
  const kept = (turn?.before ?? []).flatMap((one) => {
    const result = drawn(record, one.data, one.transforms, shapeOf(one), one.id, one.refreshSeconds);
    return 'error' in result ? [] : [result.chart];
  });
  record.charts = kept;
  delete turn?.undo;
  delete turn?.before;
  // The findings belong to the charts, and a chart that is no longer there takes its finding with it.
  record.notices = noticesFor(record.charts);
  return true;
}

// How many turns a record keeps, and the ones that go. Ten times what a prompt carries, so a conversation
// can be read back a long way, and bounded because the record is rewritten on every read rather than only
// when it changes: an unbounded turn list is the same mistake MAX_ROWS and MAX_TRANSFORMS exist to prevent,
// paid on every keystroke in every tab. The oldest goes, and with it anything that could be taken back,
// because an undo outliving its turn would have nothing to restore.
const MAX_TURNS_KEPT = 40;

export function kept(turns: readonly VisualizationTurnView[]): VisualizationTurnView[] {
  return turns.slice(-MAX_TURNS_KEPT);
}
