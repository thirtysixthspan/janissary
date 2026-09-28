// The measures a visualization knows by name, and the one rule about how a name is matched.
//
// A Pulse metric definition is documented as the "single source of truth" for every metric built on it,
// and Genie's guidance for its own measure store is that structured definitions beat prose because the
// agent "applies the logic exactly as written rather than interpreting it from natural language". Both
// are about one failure: a quantity re-derived from a column name on every turn is a quantity that means
// something slightly different on each of them, and nothing on screen can tell.
//
// So the name is the only part a chart states, and the column, the aggregate and the percentile arrive
// from the definition. Two charts that say `p95 latency` are the same measure by construction rather than
// by coincidence.

import { isAggregate } from './chart-spec.js';
import { isRecord } from '../value-guards.js';
import type { VisualizationMetric } from '../protocol.js';

// Named, so a model's reply cannot decide how many of them this conversation has, and so the prompt's
// own bound can be stated. Twelve is more than a conversation about one data source will ever need.
export const MAX_METRICS = 12;
export const MAX_SYNONYMS = 6;
// Instructions are prompt text on every turn, so the bound is on how much a conversation can accumulate
// rather than on how much one message can say.
export const MAX_INSTRUCTIONS = 10;

const NAME = /^[A-Za-z0-9][\w .%/-]{0,47}$/u;

// A name a person can type and read back: it goes into a prompt, a caption and a sentence, so the
// punctuation that makes all three awkward is refused rather than escaped. A name is also what
// distinguishes one measure from another in a conversation, and an over-long one is not a name.
export function isMetricName(value: unknown): value is string {
  return typeof value === 'string' && NAME.test(value.trim());
}

// One definition, or nothing. A metric with no column is not a metric, and a metric whose aggregate the
// grammar does not have would be stored and then refused at the moment a chart asked for it — which is a
// failure to report at the wrong time.
export function metricOf(value: unknown): VisualizationMetric | undefined {
  if (!isRecord(value)) return undefined;
  if (!isMetricName(value.name) || typeof value.y !== 'string' || value.y === '') return undefined;
  if (value.aggregate !== undefined && !isAggregate(value.aggregate)) return undefined;
  if (value.notes !== undefined && typeof value.notes !== 'string') return undefined;
  const synonyms = synonymsOf(value.synonyms);
  if (synonyms === undefined) return undefined;
  return {
    name: value.name.trim(),
    y: value.y,
    ...(value.aggregate !== undefined && { aggregate: value.aggregate }),
    ...(typeof value.percentile === 'number' && { percentile: value.percentile }),
    ...(value.notes !== undefined && { notes: value.notes }),
    ...(synonyms.length > 0 && { synonyms }),
  };
}

function synonymsOf(value: unknown): string[] | undefined {
  if (value === undefined) return [];
  if (!isSynonymList(value)) return undefined;
  return value.map((one) => one.trim());
}

// The definition a name refers to. Case-insensitively, because `P95 latency` and `p95 latency` in one
// conversation are one measure and not two, and because a user typing a name by hand will not match its
// capitalisation.
export function findMetric(metrics: readonly VisualizationMetric[], name: string): VisualizationMetric | undefined {
  const wanted = name.trim().toLowerCase();
  return metrics.find((one) => one.name.toLowerCase() === wanted);
}

// A definition, or a reason it cannot be used. The two are together because the caller is about to store
// a chart and a chart that cannot be drawn is refused by name — an unknown name must not quietly fall
// back to a column, because a chart that draws successfully and means something other than what was asked
// for is the one failure a chart cannot make.
export function resolveMetric(
  metrics: readonly VisualizationMetric[],
  name: string,
  hasColumn: (column: string) => boolean,
): { metric: VisualizationMetric } | { error: string } {
  const found = findMetric(metrics, name);
  if (found === undefined) {
    return { error: `there is no measure named "${name}", and defining one is a reply away` };
  }
  if (!hasColumn(found.y)) {
    return { error: `the measure "${found.name}" is a column named "${found.y}", which this data does not have` };
  }
  return { metric: found };
}

// The definitions as a prompt shows them: the name, the column, the reduction, and the other words the
// user uses for it. A definition whose column the data does not have is left out rather than shown and
// refused later, because a prompt offering a name that cannot be drawn is a prompt inviting a refusal.
export function metricList(metrics: readonly VisualizationMetric[], hasColumn: (column: string) => boolean): string[] {
  return metrics
    .filter((one) => hasColumn(one.y))
    .map((one) => {
      const how = one.aggregate === undefined ? '' : ` ${one.aggregate}${one.aggregate === 'percentile' ? ` ${one.percentile ?? 50}` : ''} of`;
      const also = (one.synonyms ?? []).length === 0 ? '' : ` (also called ${(one.synonyms ?? []).join(', ')})`;
      const notes = one.notes === undefined || one.notes === '' ? '' : ` — ${one.notes}`;
      return `- ${one.name}:${how} ${one.y}${also}${notes}`;
    });
}

// Definitions a reply states, folded into the record. A name that is already there is replaced rather
// than duplicated, because a user who says "actually, p95 latency means the p99" is correcting the
// measure and expects every chart of it to move with the correction - which is the whole reason a
// definition is one thing rather than a string copied into each chart.
export function remembered(record: { metrics: VisualizationMetric[] }, defined: readonly VisualizationMetric[]): string[] {
  const said = new Set(defined.map((one) => one.name.toLowerCase()));
  const kept = record.metrics.filter((one) => !said.has(one.name.toLowerCase()));
  // The measures already in the conversation outrank the ones this reply brought: a name the user typed is
  // the one they will ask for again, and `slice(-MAX_METRICS)` over the combined list dropped the oldest
  // entry overall - so a reply defining twelve of its own could empty the user's measures in one turn,
  // after which every chart naming one was refused and nothing said the measure was gone.
  const room = Math.max(0, MAX_METRICS - kept.length);
  // A definition that replaces a measure already here is not one of the reply's new ones, so it is never
  // what gets trimmed: a reply correcting a measure the user asked about has to land, or the preference
  // above would turn a correction into a loss.
  const wasHere = new Set(record.metrics.map((one) => one.name.toLowerCase()));
  const corrections = defined.filter((one) => wasHere.has(one.name.toLowerCase()));
  const fresh = defined.filter((one) => !wasHere.has(one.name.toLowerCase()));
  // Of the rest, the newest are the ones this reply is about, so the oldest of them go when there is not
  // room, and the names that did not fit are returned for the turn to say out loud.
  const wanted = Math.max(0, room - corrections.length);
  const accepted = [...corrections, ...fresh.slice(Math.max(0, fresh.length - wanted))];
  record.metrics = [...kept, ...accepted];
  return defined.filter((one) => !accepted.includes(one)).map((one) => one.name);
}

// The same rules as a guard, for the store: a record is read back from disk by a process that may be an
// older one, and a definition that cannot be read is a definition that would refuse every chart naming
// it. A name has to be unique case-insensitively, since matching is case-insensitive and two definitions
// answering to one word is a coin flip rather than a choice.
export function isMetricList(value: unknown): value is VisualizationMetric[] {
  if (!Array.isArray(value) || value.length > MAX_METRICS) return false;
  const names = new Set<string>();
  for (const metric of value) {
    const one = metricOf(metric);
    if (one === undefined) return false;
    const key = one.name.toLowerCase();
    // Unique case-insensitively, because matching is case-insensitive: two definitions answering to one
    // word is a coin flip rather than a choice.
    if (names.has(key)) return false;
    names.add(key);
  }
  return true;
}

function isSynonymList(value: unknown): value is string[] {
  return Array.isArray(value)
    && value.length <= MAX_SYNONYMS
    && value.every((one) => typeof one === 'string' && one.trim() !== '');
}
