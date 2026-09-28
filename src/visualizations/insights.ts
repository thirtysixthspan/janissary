// Three things a chart draws without saying, and the sentences that say them. A spike, a point outside
// what the series has been doing, and a rate that has changed — which is the difference between this and
// a feature that answers "what does the data say" and never "what is wrong with it".
//
// Tableau Pulse's insight service states the shape this follows: statistical models detect facts that
// are guaranteed to be accurate first, and the language is written afterwards, grounded in those facts
// ("standardised, deterministic statistical models ... act as the ground truth", per its documentation).
// Nothing here is a judgement about whether a number is concerning. Every notice states the value, the
// rule it broke and the figures behind the rule, and every one of them stays silent until it has enough
// data to mean anything — a detector that speaks on three points is worse than no detector, because a
// reader has no way to tell a confident notice from a premature one.
//
// Three rules, and none of them is a machine-learning anything:
//   * an outlier, by Tukey's fences: a value beyond one and a half interquartile ranges of the middle
//     half, which is the rule that does not move when the value being judged is itself extreme;
//   * an unexpected value, against the band the values before it have been sitting in;
//   * a trend change, when the rate of the second half differs from the rate of the first.

import { fencesOf, labelOf, lineThrough, meanAndSpread, numericValues, positions, rowsOf, slopeOf } from './insights-statistics.js';
import type { Table } from './table.js';
import type { VisualizationChartRecord } from '../protocol.js';

// How little data a detector will speak about. Eight rows for a distribution, five earlier values before
// a band can be said to exist, four points in each half before a rate means anything. Below these the
// honest sentence is the empty one.
const MINIMUM_FOR_FENCES = 8;
const MINIMUM_BEFORE_BAND = 5;
const MINIMUM_PER_HALF = 4;

// A band is two spreads either side of the mean of what came before, which on a well-behaved series
// catches a genuine excursion and on a noisy one fires often enough that a reader learns to ignore it.
// The factor is named in the sentence rather than left implicit, so a reader who disagrees with it can
// see what it was.
const BAND_SPREADS = 2;
// A rate that has changed by less than this is a rate that has not changed. Two, because a slope twice
// as steep is a different shape and a slope one and a half times as steep is usually one noisy window.
const TREND_FACTOR = 2;
// A level has moved when the two halves sit further apart than their own spreads could account for, and
// when the difference is at least a fiftieth of the larger of them so that a steady series with rounding
// in it is not reported as having stepped.
const LEVEL_SPREADS = 3;
const LEVEL_FLOOR = 0.05;
// How many of one kind a chart reports. A notice is a sentence on a screen, and a hundred of them is a
// wall of text rather than a finding; the rest are counted in the last clause so nothing is hidden.
const MAX_PER_KIND = 2;

// What one detector found: the clauses it will say, and the rows they are about. A detector that found
// more than it is saying says so on its last clause, because a report that stops at two and says nothing
// is indistinguishable from a report that found two. The rows are kept so a later detector can leave
// alone what an earlier one has already said about.
type Finding = { clauses: string[]; rows: number[] };

// The whole list, over every chart a record holds, which is what makes a notice belong to the
// visualization rather than to one card: a live update redraws the cards and the list is rebuilt from
// them, so a spike that has come back down stops being reported the moment it is not there.
export function noticesFor(charts: readonly VisualizationChartRecord[]): string[] {
  return charts.flatMap((chart) => sentenceFor(chart)).filter((one) => one !== undefined);
}

// One sentence per chart, carrying everything found in that chart's data. A paragraph per chart rather
// than a paragraph per finding, because the reader is being told about a data set and not given a list.
function sentenceFor(chart: VisualizationChartRecord): string | undefined {
  // The fences run first and the band second, and the band is told which rows the fences already spoke
  // about: one row with one notice, not the same spike reported twice by two different rules.
  const beyondFences = outliers(chart);
  const said = [
    ...beyondFences.clauses,
    ...unexpected(chart, new Set(beyondFences.rows)).clauses,
    ...levelShift(chart).clauses,
    ...trendChange(chart).clauses,
  ];
  const head = said[0];
  const last = said.at(-1);
  if (head === undefined || last === undefined) return undefined;
  const where = chart.title === '' ? '' : `In "${chart.title}", `;
  return `${where}${head === last ? last : [head, ...said.slice(1, -1), last].join('; ')}.`;
}

// A value outside the fences, named with the fences themselves: a reader who wants to check it has the
// two numbers the rule used and needs nothing else.
function outliers(chart: VisualizationChartRecord): Finding {
  const values = numericValues(chart.table, chart.y);
  if (values.length < MINIMUM_FOR_FENCES) return { clauses: [], rows: [] };
  const { low, high } = fencesOf(values);
  // A range of zero width means every value is the same, so there is no distribution to be outside of.
  if (!Number.isFinite(low) || !Number.isFinite(high) || low === high) return { clauses: [], rows: [] };
  const outside = rowsOf(chart.table, chart.y).filter((row) => row.value < low || row.value > high);
  if (outside.length === 0) return { clauses: [], rows: [] };
  const where = columnOf(chart.table, chart.x);
  // The count is the values the sentence is not about. `values.length - 1` is right for one finding
  // and wrong for every other: with two spikes it claims the other eleven when ten were judged, so the
  // figure a reader would check the rule against does not add up. What the middle half of was is the
  // values inside the fences, which is what the outside rows are counted out of.
  const inside = values.length - outside.length;
  const span = `${round(low)} to ${round(high)} that the middle half of the ${inside} other ${chart.y} values occupies`;
  const boundedRows = bounded(outside.slice(0, MAX_PER_KIND), outside.length, (row) => {
    const at = labelOf(chart.table.rows[row.index]?.[where]);
    return `${at === '' ? '' : `${at} has `}a ${chart.y} of ${row.value}, outside the ${span}`;
  }, 'row');
  return { clauses: boundedRows, rows: outside.slice(0, MAX_PER_KIND).map((row) => row.index) };
}

// A point outside the band its own history has been sitting in. The band is built from the values before
// it and nothing after, so the notice for the last point of a series is about what came before it and not
// about the excursion itself — a band including the excursion would be a band that always contains it.
function unexpected(chart: VisualizationChartRecord, alreadySpoken: ReadonlySet<number>): Finding {
  const table = chart.table;
  // Each value with the row it came from, and both indexes mean the same thing: the row is the table's
  // own, which is what a set of rows the fences already named holds, so the two detectors cannot disagree
  // about which spike is one spike. A row the fences spoke for is not spoken for again and not counted as
  // another, since a count of further findings is a claim about sentences the reader has not seen.
  const measured = rowsOf(table, chart.y);
  const values = measured.map((one) => one.value);
  const along = positions(table, chart.x);
  if (values.length < MINIMUM_BEFORE_BAND + 2 || along.length !== values.length) return { clauses: [], rows: [] };
  const where = columnOf(table, chart.x);
  const clauses: string[] = [];
  const found: number[] = [];
  let total = 0;
  for (let at = MINIMUM_BEFORE_BAND; at < measured.length; at += 1) {
    const point = measured[at];
    if (point === undefined || alreadySpoken.has(point.index)) continue;
    const before = values.slice(0, at);
    const { mean, spread } = meanAndSpread(before);
    if (!Number.isFinite(mean) || spread === 0) continue;
    const low = mean - BAND_SPREADS * spread;
    const high = mean + BAND_SPREADS * spread;
    if (point.value >= low && point.value <= high) continue;
    total += 1;
    if (clauses.length >= MAX_PER_KIND) continue;
    const label = labelOf(table.rows[point.index]?.[where]);
    const span = `${round(low)} to ${round(high)} that the ${before.length} earlier ${chart.y} values have been within`;
    found.push(point.index);
    clauses.push(`${label === '' ? '' : `${label} has `}a ${chart.y} of ${round(point.value)}, outside the ${span}`);
  }
  return { clauses: bounded(clauses, total, (one) => one, 'value'), rows: found };
}

// A rate that has changed, and a level that has moved. Two detectors rather than one, because the
// obvious failure is a series that steps from one value to another and never slopes at all — which a
// slope comparison reads as no change whatsoever, since both halves of it are flat.
function levelShift(chart: VisualizationChartRecord): Finding {
  const values = numericValues(chart.table, chart.y);
  if (values.length < MINIMUM_PER_HALF * 2) return { clauses: [], rows: [] };
  const along = positions(chart.table, chart.x);
  const half = Math.floor(values.length / 2);
  if (along.length !== values.length || half < MINIMUM_PER_HALF) return { clauses: [], rows: [] };
  const before = values.slice(0, half);
  const after = values.slice(half);
  // Fitted against the position of each point rather than its instant: a line fitted over values of the
  // order of a trillion and evaluated a trillion away from them loses every digit it had.
  const first = lineThrough(indices(half), before);
  const second = lineThrough(indices(values.length - half), after);
  if (!Number.isFinite(first.slope) || !Number.isFinite(second.slope)) return { clauses: [], rows: [] };
  // Each half is asked what level its own trend predicts at the boundary between them — the later half
  // extrapolated back to it — and the two answers are compared. Comparing the halves' medians instead
  // would report every rising series as a step, because a rising series does sit at a different level in
  // its second half: that is what rising means.
  const at = half - 1;
  const from = first.slope * at + first.intercept;
  const to = second.intercept;
  const pooled = Math.max(meanAndSpread(before).spread, meanAndSpread(after).spread);
  const shift = Math.abs(to - from);
  // A step inside a series that is otherwise perfectly steady has no spread to be measured against, so
  // the pooled spread cannot be the only test — a relative floor is what keeps a difference of one part
  // in a thousand from being reported as a step.
  if (shift <= LEVEL_SPREADS * pooled || shift < LEVEL_FLOOR * Math.max(Math.abs(from), Math.abs(to))) {
    return { clauses: [], rows: [] };
  }
  return {
    clauses: [`the level of ${chart.y} against ${chart.x} stepped at the middle of the series, from about ${round(from)} where the earlier points were heading to about ${round(to)} where the later ones are`],
    rows: [],
  };
}

// A rate that has changed. Two least-squares slopes over the two halves of the series, compared by
// factor rather than by difference, because a rate that halves and a rate that doubles are the same
// finding and only the size of the ratio tells them apart.
function trendChange(chart: VisualizationChartRecord): Finding {
  const values = numericValues(chart.table, chart.y);
  const along = positions(chart.table, chart.x);
  const half = Math.floor(values.length / 2);
  if (values.length < MINIMUM_PER_HALF * 2 || along.length !== values.length) return { clauses: [], rows: [] };
  const first = slopeOf(indices(half), values.slice(0, half));
  const second = slopeOf(indices(values.length - half), values.slice(half));
  if (!Number.isFinite(first) || !Number.isFinite(second)) return { clauses: [], rows: [] };
  const factor = Math.abs(second / first);
  if (!Number.isFinite(factor) || factor < TREND_FACTOR) return { clauses: [], rows: [] };
  const steeper = Math.abs(second) > Math.abs(first) ? 'steeper' : 'flatter';
  return {
    clauses: [`the rate of ${chart.y} against ${chart.x} has changed by a factor of ${factor.toFixed(1)}, from ${rate(first)} to ${rate(second)}, and the later ${values.length - half} points are the ${steeper} of the two`],
    rows: [],
  };
}

// The bounded report: say the first few, and say how many more there were. The count goes on the last
// clause rather than on every one of them, because repeating it is the sentence a reader skips.
function bounded<T>(shown: readonly T[], total: number, clause: (one: T) => string, noun: string): string[] {
  const said = shown.map((one) => clause(one));
  const last = said.length - 1;
  if (last < 0) return [];
  const rest = total - shown.length;
  const tail = said[last] ?? '';
  said[last] = rest > 0 ? `${tail}, and ${rest} more ${noun}${rest === 1 ? '' : 's'} ${rest === 1 ? 'is' : 'are'} outside the same range` : tail;
  return said;
}

// 0, 1, 2, ... — the position of each point in its own half, which is the axis a rate per step is
// measured along and the one a fitted line can be evaluated near.
function indices(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

function columnOf(table: Table, name: string): number {
  return table.columns.findIndex((one) => one.name === name);
}

// A number as a sentence carries it: no trailing zeros, no floating-point tail, and no exponent on a
// value a reader would rather see in full. A latency of 4.2ms does not need sixteen digits.
function round(value: number): string {
  if (!Number.isFinite(value)) return 'none';
  return String(Math.round(value * 1000) / 1000);
}

// A rate in y per x, with just enough digits to tell it from its neighbour and no more: a slope in
// milliseconds per day is not a figure anyone reads to twelve significant figures.
function rate(value: number): string {
  const magnitude = Math.abs(value);
  const digits = magnitude < 1 ? 4 : magnitude < 100 ? 2 : 0;
  return `${round(Number(value.toFixed(digits)))} per step`;
}
