import { COMPARES } from './chart-spec.js';
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

export function chatPrompt(record: VisualizationRecord, context: PromptContext): string {
  const datasets = record.datasets.map((one) => describeDataset(one)).join('\n\n');
  const charts = record.charts.length === 0 ? 'There are no charts yet.' : record.charts.map((one) => describeChart(one)).join('\n');
  return [
    'You are helping someone chart data. They name a source, you work out how to reach the data behind it, you ask what they want to see, you draw it, and then you keep answering their questions about it and the chart.',
    '',
    `Their workspace is ${context.workspace}. Write anything you acquire there and nowhere else.`,
    '',
    '## The data',
    context.sourceNote ?? datasets,
    '',
    '## The charts',
    charts,
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
