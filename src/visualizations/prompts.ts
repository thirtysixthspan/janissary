import { COMPARES } from './chart-spec.js';
import { metricList } from './metrics.js';
import { AGGREGATE_RULE, CONTRACT, DATA_RULE, EXAMPLE, FOLLOW_UP_RULE, KIND_RULE, MAX_TURNS_IN_PROMPT, TRANSFORM_RULE } from './reply.js';
import type { VisualizationRecord } from './store.js';
import type { VisualizationChartRecord, VisualizationDatasetView, VisualizationTurnView } from '../protocol/visualizations.js';

// The one prompt, and the small one that asks for a re-read. Every prompt carries the whole state it
// needs — the datasets, the charts, the exchange — so a call behaves the same on a live session and on
// a freshly connected one, and the agent subprocess is a voice rather than the memory. That is why
// there is no replay here: a killed session costs a reconnect and nothing else.
//
// The exchange is capped rather than carried whole, because a very long conversation would otherwise
// put a transcript in every prompt. The tab still shows all of it; what the model loses is the far end.

const SAMPLE_ROWS = 8;

export type PromptContext = {
  // What to say about the source the user has not named yet, or could not be read.
  sourceNote?: string;
  // The directory the agent may write the data it acquires into.
  workspace: string;
  // True while this prompt is asking for a re-read rather than answering a message.
  refresh?: boolean;
  // What the host's own statistics found in the data, as sentences. They are shown to the model so it
  // does not re-derive a finding the host has already made in its own voice.
  notices?: string[];
};

function columnsOf(dataset: VisualizationDatasetView): string {
  return dataset.table?.columns.map((column) => `- ${column.name} (${column.type})`).join('\n') ?? '';
}

function sampleOf(dataset: VisualizationDatasetView): string {
  return JSON.stringify(dataset.table?.rows.slice(0, SAMPLE_ROWS) ?? []);
}

// One dataset as the model is shown it: what it is, what it holds, and — when it holds a page rather
// than a table — the page itself, because working out what an API documentation page describes is the
// model's job and it cannot do it from a summary.
function describeDataset(dataset: VisualizationDatasetView): string {
  const name = dataset.key === 'source' ? 'the source the user pointed at' : `the file "${dataset.key}" you acquired`;
  if (dataset.error !== undefined) return `${name}: the last read failed — ${dataset.error}`;
  if (dataset.table !== undefined) {
    return [
      name,
      `Rows available: ${dataset.table.rows.length}${dataset.table.truncated ? ` (of ${dataset.table.total} read; only the first ${dataset.table.rows.length} are kept)` : ''}`,
      'Columns:',
      columnsOf(dataset),
      'First rows, as JSON:',
      sampleOf(dataset),
    ].join('\n');
  }
  if (dataset.document !== undefined) {
    return [
      name,
      'It is not itself a table. What it contains, verbatim:',
      dataset.document,
      'Work out how to fetch the data it describes, fetch it, and write what you fetched into your workspace as JSON or delimited text with a header row. Then reference it with `{"kind":"file","path":"…"}`.',
    ].join('\n');
  }
  return `${name}: nothing read from it yet.`;
}

function describeChart(chart: VisualizationChartRecord): string {
  return `- ${chart.id}: ${JSON.stringify(chart)}`;
}

function exchangeOf(turns: readonly VisualizationTurnView[]): string {
  return turns
    .slice(-MAX_TURNS_IN_PROMPT)
    .flatMap((turn) => [`User: ${turn.query}`, `You: ${turn.response}`])
    .join('\n');
}

// The findings the host has already made, under a heading that says who made them: a notice is a
// deterministic measurement, and the model is being asked what to do about it rather than whether it is
// real. A chart that is merely unusual and a spike that is a fault look the same from here.
function noticesSectionOf(notices: readonly string[] | undefined): string {
  if (notices === undefined || notices.length === 0) return '';
  return [
    '## What the data is doing',
    "The host checked the charts' own data and found:",
    ...notices.map((one) => `- ${one}`),
  ].join('\n');
}

export function chatPrompt(record: VisualizationRecord, context: PromptContext): string {
  const datasets = record.datasets.map((one) => describeDataset(one)).join('\n\n');
  const charts = record.charts.length === 0 ? 'There are no charts yet.' : record.charts.map((one) => describeChart(one)).join('\n');
  // A refusal about the source sits above the data rather than in place of it. What the user named one
  // message ago is usually still held, and a prompt that showed only the refusal left the model with no
  // columns, no row count and no sample — so it could not answer the question that was actually asked
  // and said so, for a reason having nothing to do with the question.
  // The measures the user has already named, with the column and the reduction behind each and the other
  // words they use for it. A definition whose column this data does not have is left out rather than shown
  // and refused later, because a prompt offering a name that cannot be drawn invites a refusal.
  const known = metricList(record.metrics, (column) =>
    record.datasets.some((dataset) => dataset.table?.columns.some((one) => one.name === column) === true));
  const measures = known.length === 0 ? '' : ['## The measures you know', ...known].join('\n');
  const data = [context.sourceNote, datasets, measures].filter((part) => part !== undefined && part !== '').join('\n\n');
  // The rules, ahead of the conversation and labelled, because a model told them in the first message and
  // then shown twelve turns that do not contain them has been given two sources of truth and no way to
  // tell which is current. A rule the user later contradicted in a message is answered by the message:
  // they are the user, and they are here now.
  const said = record.instructions.filter((rule) => rule !== '');
  const rules = said.length === 0 ? '' : [
    '## What the user has told you to keep doing',
    "These are the user's own standing instructions for this visualization. They outrank your defaults and they apply to every reply from now on, including the ones where the conversation does not mention them. If the user later asks for something different in a message, the message is newer and the message wins.",
    ...said.map((rule) => `- ${rule}`),
  ].join('\n');
  return [
    'You are helping someone chart data. They name a source, you work out how to reach the data behind it, you ask what they want to see, you draw it, and then you keep answering their questions about it and the chart.',
    '',
    `Their workspace is ${context.workspace}. Write anything you acquire there and nowhere else.`,
    '',
    rules,
    rules === '' ? '' : '',
    '## The data',
    data,
    '',
    '## The charts',
    charts,
    noticesSectionOf(context.notices),
    '',
    '## So far',
    exchangeOf(record.turns) || 'This is the beginning of the conversation.',
    '',
    '## What to reply with',
    `\`say\` is what you say to the user. Ask them what you need when you do not know: which measure to plot, what to compare it against, how to group or split it, what to call the result. Say plainly when you could not get the data rather than inventing a chart.`,
    `\`charts\` is the list of charts to add or change. ${KIND_RULE} \`x\` and \`y\` must name columns listed above, and \`y\` must be a numeric column. \`series\` is optional and names a column whose distinct values split the marks into one each. Give a short title, and axis labels only where they add something the column names do not already say. An entry with an \`id\` changes that chart and leaves every field it does not mention alone; an entry with no \`id\` is a new chart.`,
    AGGREGATE_RULE,
    DATA_RULE,
    TRANSFORM_RULE,
    `Comparisons are ${COMPARES.join(', ')}.`,
    '`notices` is optional: one or two things you noticed in the data itself, as a plain sentence naming the value and where it was. The host shows its own measurements of the data separately, so do not repeat one of those; say what it means rather than what it is. Leave it out when you have noticed nothing.',
    '`xUnit` is optional and groups a date x column by a calendar unit — year, quarter, month, week or day — so a two-year daily series can be a chart of months. It is refused on a column that is not a date. Without it a date column is one band per distinct value, which for a daily source is one band per day.',
    '`stack` is optional and needs a `series`: "zero" draws each series on top of the last so the height of each band is the total, and "normalize" does the same as a share of that total, so the bands read as percentages. Without it the series sit side by side. It is refused on a pie and on a scatter.',
    '`metrics` is optional and names measures the user uses, each with the column it means, the aggregate over it, and any other words for it; a name given here is the same measure in every later chart, so use the name rather than re-deriving the column.',
    "A chart may state `metric` instead of `y` and `aggregate`, and then it draws that named measure. An unknown name is refused rather than drawn as something else.",
    '`remove` is a list of chart ids to drop.',
    '`name` renames the visualization, and is how the user renames it in words.',
    'Answer with prose and no charts when the user asked a question about the data rather than for a change.',
    FOLLOW_UP_RULE,
    CONTRACT,
    EXAMPLE,
  ].join('\n');
}

export function refreshPrompt(
  record: VisualizationRecord,
  chart: VisualizationChartRecord,
  context: PromptContext,
): string {
  return [
    'The user asked for this chart to keep itself current, and its interval has come round.',
    `Its data is \`${JSON.stringify(chart.data)}\`, and the chart now is: ${JSON.stringify(chart)}`,
    chart.data.kind === 'file'
      ? 'Fetch it again the same way you did before, write it to the same path, and reply with the same chart specification. Reply with the specification in `charts` and nothing else in `say`.'
      : 'Reply with the same chart specification in `charts`, so the host re-reads the source and redraws it. Reply with nothing in `say`.',
    `Your workspace is ${context.workspace}.`,
    CONTRACT,
    EXAMPLE,
  ].join('\n');
}
