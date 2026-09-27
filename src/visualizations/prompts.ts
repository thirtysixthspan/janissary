import { isRecord } from '../value-guards.js';
import type { VisualizationChartKind, VisualizationChartView } from '../protocol/visualizations.js';
import { isAggregate } from './chart-spec.js';
import type { Table } from './table.js';

export const CHART_KINDS: readonly VisualizationChartKind[] =
  ['bar', 'line', 'area', 'scatter', 'pie'];

export type Question = { id: string; question: string; suggestions: string[] };
export type Reply =
  | { kind: 'questions'; questions: Question[] }
  | { kind: 'chart'; chart: VisualizationChartView; note: string }
  | { kind: 'text'; text: string };

const SAMPLE_ROWS = 8;
const MAX_QUESTIONS = 6;
const MAX_SUGGESTIONS = 4;

// How the chart prompt states the aggregate, in one place because the same sentence has to appear in
// both prompts: a model told the field once will answer with it, and told it twice inconsistently will
// answer with either shape.
const AGGREGATE_RULE = [
  '`aggregate` is optional and reduces `y` within each category — and within each series of a category where `series` is given — before anything is drawn. It is one of "sum", "mean", "count", "min", "max".',
  'Leave it out when every row is its own mark, which is right when one row is already one point of the answer.',
  'Set it when the rows are finer than the question: one row per transaction needs "sum" to answer revenue by region, and "count" answers how many transactions each region had.',
  'A pie sums when you leave it out.',
  'A row whose `y` is not a number is never drawn and never counted, whichever aggregate you choose.',
].join(' ');

const EXAMPLE = '{"kind":"bar","x":"...","y":"...","series":"...","aggregate":"sum","title":"...","xLabel":"...","yLabel":"...","note":"..."}';

// The shape each prompt asks for, stated as prose in the prompt itself and enforced again by the
// guards below. A model asked for prose will sometimes answer with prose, so the parser has to be
// able to say so; a model asked for a shape and given the shape in the prompt answers with it far
// more often than one asked in the abstract.
const CONTRACT =
  'Reply with one JSON object and nothing else — no prose before or after it, no code fence.';

function sample(table: Table): unknown[] {
  return table.rows.slice(0, SAMPLE_ROWS);
}

function describe(table: Table): string {
  const columns = table.columns
    .map((column) => `- ${column.name} (${column.type})`)
    .join('\n');
  return [
    `Columns:\n${columns}`,
    `Rows available: ${table.rows.length}`,
    'First rows, as JSON:',
    JSON.stringify(sample(table)),
  ].join('\n');
}

export function openingPrompt(source: string, table: Table): string {
  return [
    'You are helping someone choose a chart for a data source they just pointed at.',
    `Their source is: ${source}`,
    describe(table),
    '',
    `Ask up to ${MAX_QUESTIONS} questions, one at a time, about what they want to see: which measure to plot, what to compare it against, how to group or split it, and what to call the result.`,
    `Give each question at most ${MAX_SUGGESTIONS} short suggested answers. The user may answer in their own words instead, so never phrase a question as if only your suggestions were possible.`,
    'Do not propose a chart yet. Do not ask about anything the data cannot answer.',
    CONTRACT,
    '{"questions":[{"question":"...","suggestions":["...","..."]}]}',
  ].join('\n');
}

export function chartPrompt(
  table: Table,
  questions: readonly { question: string; answer?: string }[],
): string {
  const asked = questions
    .filter((entry) => typeof entry.answer === 'string' && entry.answer.trim() !== '')
    .map((entry) => `Q: ${entry.question}\nA: ${entry.answer as string}`)
    .join('\n\n');
  return [
    'Choose the chart that best answers the questions below.',
    describe(table),
    asked === '' ? 'The user asked no questions, so choose a chart that shows the data usefully on its own.' : `Their answers:\n\n${asked}`,
    '',
    `\`kind\` is one of ${CHART_KINDS.join(', ')}. \`x\` and \`y\` must name columns listed above, and \`y\` must be a numeric column. \`series\` is optional and names a column whose distinct values split the marks into one each; leave it out for a single series. For \`pie\`, \`x\` is the category and \`y\` is reduced per category.`,
    AGGREGATE_RULE,
    'Give a short title, and axis labels only where they add something the column names do not already say.',
    CONTRACT,
    EXAMPLE,
  ].join('\n');
}

export function revisionPrompt(
  table: Table,
  chart: VisualizationChartView,
  query: string,
): string {
  return [
    'The user is asking for a change to a chart.',
    `They said: ${query}`,
    describe(table),
    `The chart now is: ${JSON.stringify(chart)}`,
    '',
    'Answer with the updated chart if the request changes what is drawn, using the same shape as before. If the request is a question about the data rather than a change to the chart, answer it in `note` and repeat the chart unchanged. Never change anything the request did not ask about — including the aggregate, which stays as it is unless the request is about how the measure is reduced.',
    CONTRACT,
    EXAMPLE,
  ].join('\n');
}

// A model that wrapped its answer in a fence is the common case, not the exception, so unwrapping is
// part of parsing rather than a fallback. Everything after the object is dropped for the same reason
// a fence is: a model that added a sentence after the JSON meant the JSON.
function unwrap(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/u.exec(text);
  const body = fenced?.[1] ?? text;
  return body.slice(body.indexOf('{'), body.lastIndexOf('}') + 1);
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isKind(value: unknown): value is VisualizationChartKind {
  return typeof value === 'string' && (CHART_KINDS as readonly string[]).includes(value);
}

function chartOf(value: Record<string, unknown>): VisualizationChartView | undefined {
  if (!isKind(value.kind)) return undefined;
  if (typeof value.x !== 'string' || typeof value.y !== 'string') return undefined;
  if (typeof value.title !== 'string' || value.title.trim() === '') return undefined;
  // An aggregate the grammar does not have fails the whole specification rather than being dropped, the
  // way an unknown `kind` does. Dropping it would leave a chart that draws successfully and means
  // something other than what the model said, which is the one failure a chart cannot be allowed to
  // make silently.
  if (value.aggregate !== undefined && !isAggregate(value.aggregate)) return undefined;
  return {
    kind: value.kind,
    x: value.x,
    y: value.y,
    ...(typeof value.series === 'string' && value.series !== '' && { series: value.series }),
    ...(isAggregate(value.aggregate) && { aggregate: value.aggregate }),
    title: value.title,
    ...(typeof value.xLabel === 'string' && value.xLabel !== '' && { xLabel: value.xLabel }),
    ...(typeof value.yLabel === 'string' && value.yLabel !== '' && { yLabel: value.yLabel }),
  };
}

function noteOf(value: Record<string, unknown>): string {
  return typeof value.note === 'string' ? value.note : '';
}

// Questions are numbered rather than given ids of the model's own, because the id has to survive a
// round trip through the record and through the tab payload, and a model-supplied id is neither.
export function parseQuestions(text: string): Question[] | undefined {
  const parsed = parseJsonObject(unwrap(text));
  if (!parsed || !Array.isArray(parsed.questions)) return undefined;
  const questions: Question[] = [];
  for (const entry of parsed.questions) {
    if (!isRecord(entry) || typeof entry.question !== 'string' || entry.question.trim() === '') continue;
    const suggestions = Array.isArray(entry.suggestions)
      ? entry.suggestions
        .filter((value): value is string => typeof value === 'string' && value.trim() !== '')
        .slice(0, MAX_SUGGESTIONS)
      : [];
    questions.push({ id: `q${questions.length + 1}`, question: entry.question, suggestions });
    if (questions.length === MAX_QUESTIONS) break;
  }
  return questions.length > 0 ? questions : undefined;
}

export function parseChart(text: string): { chart: VisualizationChartView; note: string } | undefined {
  const parsed = parseJsonObject(unwrap(text));
  if (!parsed) return undefined;
  const chart = chartOf(parsed);
  return chart && { chart, note: noteOf(parsed) };
}
