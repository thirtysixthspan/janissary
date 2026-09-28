import { isRecord } from '../value-guards.js';
import { MAX_METRICS, metricOf } from './metrics.js';
import { AGGREGATES, CHART_KINDS, MAX_FILTER_VALUES, MAX_TRANSFORMS, chartShapeOf, isDataRef, isTransformList } from './chart-spec.js';
import type { ChartShape, VisualizationClarify, VisualizationDataRef, VisualizationMetric, VisualizationTransform } from '../protocol/visualizations.js';

// What a reply may say, and how it is read.
//
// The reply is one JSON object: prose in `say`, the charts to add or change in `charts`, chart ids to
// drop in `remove`, a name for the visualization in `name`, and two to four requests the user could
// make in `followUps`. A chart carrying an `id` merges over the chart that id names, so "just change
// the title" is one field and nothing else moves; a chart with no id is a new one.
//
// Nothing here casts. A reply is a value produced by a system that was handed a sample of someone
// else's data, and every field that cannot be read is dropped rather than believed — a chart missing
// its measure is not a chart, and a step naming a column the grammar does not have is not a step.

// How many of the model's own observations are carried into a turn, beside the host's. Bounded for the
// same reason the suggestions are: a reply is a sentence and a list, and a list with no bound is whatever
// the model felt like returning.
export const MAX_NOTICES = 4;

export const MAX_FOLLOW_UPS = 4;
export const MAX_TURNS_IN_PROMPT = 12;

// What a reply asked for, once every field has been read. A chart entry carries the specification the
// model chose, plus whichever of `id`, `data` and `transforms` it stated; a chart being changed may
// state only what changes, and a chart being added must state the rest.
export type ReplyChart = {
  id?: string;
  data?: VisualizationDataRef;
  transforms?: VisualizationTransform[];
  // A measure the user has named, in place of `y` and `aggregate`. The shape is still required, so the
  // model states both and the name wins: a stored chart that resolved to a column nobody asked for is a
  // chart that draws successfully and means something else.
  metric?: string;
} & ChartShape;

export type Reply = {
  say: string;
  charts: ReplyChart[];
  remove: string[];
  name?: string;
  // What the model noticed in the data, in its own words and bounded like the suggestions. The host has
  // its own notices, computed from the data and shown beside these; the two are kept apart because this
  // one is a reading of the data and the other is a measurement of it, and a reader who cannot tell
  // which is which has been told something as a fact that is only an opinion.
  notices: string[];
  followUps: string[];
  // Measures this reply defines or changes, applied before its charts are placed so a single turn can
  // introduce a measure and draw with it.
  metrics: VisualizationMetric[];
  // A question the model could not answer on its own, with the readings it considered. A filter value it
  // could not find, a column it read two ways, a word that named two of them: the model says so and the
  // user picks, which is the only route out of a coin flip that neither of them can see.
  clarify?: VisualizationClarify;
};

function strings(value: unknown, cap: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
    .map((entry) => entry.trim())
    .slice(0, cap);
}

// A chart entry, or nothing. `id` and the data reference and the transforms are all optional because a
// chart being changed may state only what changes; everything else is required, so a half-specified
// chart is refused rather than filled in with a guess.
// Definitions a reply states, read defensively: one unreadable definition is dropped and the rest kept,
// because refusing the whole reply over a synonym that was a number would cost the user their chart.
// A question and up to four readings, or nothing. The bound is the same as the suggestions', because a
// row of buttons is a row of buttons however many reasons there are for asking.
export function clarifyOf(value: unknown): VisualizationClarify | undefined {
  if (!isRecord(value)) return undefined;
  const question = typeof value.question === 'string' ? value.question.trim() : '';
  if (question === '') return undefined;
  const options = strings(value.options, MAX_FOLLOW_UPS);
  if (options.length === 0) return undefined;
  return { question, options };
}

function metricsOf(value: unknown): VisualizationMetric[] {
  if (!Array.isArray(value)) return [];
  const found: VisualizationMetric[] = [];
  for (const entry of value) {
    const one = metricOf(entry);
    if (one) found.push(one);
    if (found.length === MAX_METRICS) break;
  }
  return found;
}

function chartOf(value: Record<string, unknown>): ReplyChart | undefined {
  const shape = chartShapeOf(value);
  if (!shape) return undefined;
  const id = typeof value.id === 'string' && value.id !== '' ? value.id : undefined;
  const data = isDataRef(value.data) ? value.data : undefined;
  const transforms = value.transforms === undefined
    ? undefined
    : (isTransformList(value.transforms) ? [...value.transforms] : undefined);
  const metric = typeof value.metric === 'string' && value.metric.trim() !== ''
    ? value.metric.trim()
    : undefined;
  return {
    ...shape,
    ...(id !== undefined && { id }),
    ...(metric !== undefined && { metric }),
    ...(data !== undefined && { data }),
    ...(transforms !== undefined && { transforms }),
  };
}

// A model that wrapped its answer in a fence is the common case, not the exception, so unwrapping is
// part of parsing rather than a fallback. Everything after the object is dropped for the same reason a
// fence is: a model that added a sentence after the JSON meant the JSON.
function unwrap(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/u.exec(text);
  const body = fenced?.[1] ?? text;
  return body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1);
}

export function parseReply(text: string): Reply | undefined {
  const body = unwrap(text);
  if (body === '') return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (!isRecord(parsed)) return undefined;
  const charts = Array.isArray(parsed.charts)
    ? parsed.charts.flatMap((entry) => { const one = chartOf(entry); return one ? [one] : []; })
    : [];
  const name = typeof parsed.name === 'string' && parsed.name.trim() !== '' ? parsed.name.trim() : undefined;
  return {
    say: typeof parsed.say === 'string' ? parsed.say : '',
    charts,
    remove: strings(parsed.remove, MAX_FOLLOW_UPS * 4),
    ...(name !== undefined && { name }),
    notices: strings(parsed.notices, MAX_NOTICES),
    metrics: metricsOf(parsed.metrics),
    ...(clarifyOf(parsed.clarify) !== undefined && { clarify: clarifyOf(parsed.clarify) as VisualizationClarify }),
    followUps: strings(parsed.followUps, MAX_FOLLOW_UPS),
  };
}

// The vocabulary, stated once and used by both prompts. A model told a field once answers with it, and
// told it twice inconsistently answers with either shape — so each list below appears in exactly one
// rule string that both prompts quote.
export const KIND_RULE = `\`kind\` is one of ${CHART_KINDS.join(', ')}.`;

export const AGGREGATE_RULE = [
  '`aggregate` is optional and reduces `y` within each category — and within each series of a category where `series` is given — before anything is drawn.',
  `It is one of ${AGGREGATES.map((one) => `"${one}"`).join(', ')}.`,
  'Leave it out when every row is its own mark, which is right when one row is already one point of the answer.',
  'Set it when the rows are finer than the question: one row per transaction needs "sum" to answer revenue by region, and "count" answers how many transactions each region had.',
  'Reach for "median" or "percentile" rather than "mean" when the measure is long-tailed — a duration, a size, a latency — because a mean is dragged by the tail into a number that describes no row at all. "percentile" also carries a "percentile" field holding a whole number from 0 to 100; it is refused without one, and beside any other aggregate. "variance" says how spread a series is, and "distinct" counts the values a column holds rather than the rows it has.',
  'A pie sums when you leave it out.',
  'A row whose `y` is not a number is never drawn and never counted, whichever aggregate you choose.',
].join(' ');

export const TRANSFORM_RULE = [
  `\`transforms\` is an ordered list of at most ${MAX_TRANSFORMS} steps, each one of:`,
  '`{"op":"filter","column":"…","compare":"eq"|"ne"|"gt"|"gte"|"lt"|"lte"|"contains","value":…}` keeps only the rows that match,',
  `or \`{"op":"filter","column":"…","compare":"in","values":[…]}\` for any of up to ${MAX_FILTER_VALUES} values;`,
  '`{"op":"derive","name":"…","expression":"…"}` adds one numeric column computed from an arithmetic expression over the columns already there, using numbers, column names, `+ - * /`, unary minus and parentheses and nothing else;',
  '`{"op":"sort","column":"…","direction":"asc"|"desc"}` orders the rows by one column;',
  '`{"op":"limit","count":N}` keeps the rows of the first N distinct values of the chart\'s own x column, in the order the sort left them.',
  'They are applied in order, so a sort followed by a limit is a top-N and the reverse is a first-N. Give the whole list every time; it replaces what was there rather than adding to it.',
].join(' ');

export const DATA_RULE = [
  '`data` is where the chart\'s data comes from: `{"kind":"source"}` for the source the user pointed at,',
  'or `{"kind":"file","path":"…"}` for a file you acquired yourself and wrote inside your workspace.',
  'Use a file whenever the source is not itself the data — a page describing an API, an endpoint needing a header, a response needing reshaping — and write what you fetched there as JSON or delimited text with a header row.',
].join(' ');

const CONTRACT = 'Reply with one JSON object and nothing else — no prose before or after it, no code fence.';

const EXAMPLE = '{"say":"…","name":"…","charts":[{"id":"…","data":{"kind":"source"},"transforms":[],"kind":"bar","x":"…","y":"…","series":"…","aggregate":"sum","title":"…","xLabel":"…","yLabel":"…"}],"remove":[],"followUps":["…","…"]}';

// Two to four requests the user could make next, each a request rather than a question so clicking one
// sends it as the user's own words.
export const FOLLOW_UP_RULE = [
  'Alongside `say`, offer two to four short follow-up requests the user could make about this — the next things worth looking at, in the same voice as a modification such as "split by region".',
  'Each is sent as the user\'s request, so make each one a request rather than a question.',
  'Offer none when the data and the charts answer everything they can.',
].join(' ');

export { CONTRACT, EXAMPLE };
