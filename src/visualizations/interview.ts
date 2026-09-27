import { isRateLimitError } from '../acp/rate-limit.js';
import type { ConversationModelPair, VisualizationTurnView } from '../protocol.js';
import type { VisualizationChartView } from '../protocol/visualizations.js';
import type { AcpSessionPool } from '../acp/session-pool.js';
import { validateChart } from './chart-spec.js';
import { chartPrompt, openingPrompt, parseChart, parseQuestions, revisionPrompt } from './prompts.js';
import type { Table } from './table.js';
import type { VisualizationRecord } from './store.js';
import { interviewComplete, isUntitled, usablePair, visualizationTitle } from './view.js';

// The three calls the model is asked for, and nothing else. Each prompt carries the whole state it
// needs — the sample, the questions and their answers, the chart as it stands — so a call behaves the
// same on a live session and on a freshly connected one, and the agent subprocess is a voice rather
// than the memory. That is why there is no replay here: a killed session costs a reconnect and
// nothing else, which is the one place this feature is simpler than a conversation.
type Call = 'open' | 'close' | 'revise';

// The turn the reply lands on, carried with the in-flight call rather than looked up when it ends, so
// a reply always has somewhere to go. It is absent for the opening call, whose reply is questions.
type InFlight = { call: Call; accumulated: string; turn?: VisualizationTurnView };

type InterviewerOptions = {
  pool: AcpSessionPool;
  // The empty workspace this record's agent is confined to, created on first use rather than at
  // creation, so a visualization nobody ever asked anything of leaves nothing on disk.
  workspace(id: string): string;
  now(): number;
  // Called after every state change the tab can see, and it is what throttles the topic: the manager
  // emits, the plugin redraws, and nothing here knows either exists.
  changed(): void;
  // Persists the record with `error` set or cleared, stamps it, and reports the change. Every
  // completion goes through here, so a chart, a reply, and a failure all land the same way.
  commit(record: VisualizationRecord, error?: string): void;
};

export class VisualizationInterviewer {
  private readonly inFlight = new Map<string, InFlight>();

  constructor(private readonly options: InterviewerOptions) {}

  ids(): IterableIterator<string> {
    return this.inFlight.keys();
  }

  busy(id: string): boolean {
    return this.inFlight.has(id);
  }

  // The opening call. Refused once a chart exists, because re-asking someone who is already looking
  // at a chart would throw away work they can see.
  open(record: VisualizationRecord): boolean {
    if (this.busy(record.id) || record.chart !== undefined || !record.table) return false;
    return this.prompt(record, 'open', openingPrompt(record.source, tableOf(record)));
  }

  // The call that produces the chart, once every question has an answer. The answers the user gave are
  // the query, so the turn carrying the chart is created here as well: without one the chart appears
  // and the tab says nothing about it, which is the same gap a modification had when the model
  // changed the chart without explaining.
  close(record: VisualizationRecord): boolean {
    if (this.busy(record.id) || record.chart !== undefined || !record.table) return false;
    if (!interviewComplete(record)) return false;
    const pair: ConversationModelPair = usablePair(record.pair);
    record.pair = pair;
    const turn: VisualizationTurnView = {
      query: record.questions.map((entry) => entry.answer ?? '').filter((answer) => answer !== '').join('; '),
      response: '',
      pair,
      streaming: true,
    };
    record.turns.push(turn);
    record.updatedAt = this.options.now();
    this.options.changed();
    return this.prompt(record, 'close', chartPrompt(tableOf(record), record.questions), turn);
  }

  // A modification against the chart on screen. The turn is created before the call so the tab can
  // show the query while the model works on it, the way a conversation shows a query while its reply
  // streams.
  revise(record: VisualizationRecord, query: string): boolean {
    if (this.busy(record.id) || !query.trim() || !record.chart || !record.table) return false;
    const pair: ConversationModelPair = usablePair(record.pair);
    record.pair = pair;
    const turn: VisualizationTurnView = { query, response: '', pair, streaming: true };
    record.turns.push(turn);
    record.updatedAt = this.options.now();
    this.options.changed();
    return this.prompt(record, 'revise', revisionPrompt(tableOf(record), record.chart, query), turn);
  }

  // Cancelling ends the session rather than the turn alone: `AcpSession` has no per-prompt abort, so
  // the only way to stop a stream is to kill the process. Dropping the in-flight turn is the caller's
  // job, because the caller is what holds the record.
  cancel(id: string): boolean {
    this.options.pool.close(id);
    return this.inFlight.delete(id);
  }

  forget(id: string): void {
    this.cancel(id);
  }

  dispose(): void {
    this.inFlight.clear();
    this.options.pool.dispose();
  }

  private prompt(
    record: VisualizationRecord,
    call: Call,
    text: string,
    turn?: VisualizationTurnView,
  ): boolean {
    const pending: InFlight = { call, accumulated: '', ...(turn && { turn }) };
    this.inFlight.set(record.id, pending);
    this.options.changed();
    const session = this.options.pool.session(
      record.id, usablePair(record.pair), this.options.workspace(record.id), {
        onError: (message) => { this.fail(record, pending, message); },
      },
    );
    session.prompt(text, {
      // Nothing is rendered from a partial reply, because a partial reply is half a JSON object and
      // half of one is not worth showing. The text accumulates and is read once, at the end.
      onChunk: (chunk) => { this.accumulate(record, pending, chunk); },
      onEnd: () => { this.complete(record, pending); },
      onError: (message) => { this.fail(record, pending, message); },
    });
    return true;
  }

  private accumulate(record: VisualizationRecord, pending: InFlight, text: string): void {
    if (this.inFlight.get(record.id) === pending) pending.accumulated += text;
  }

  private complete(record: VisualizationRecord, pending: InFlight): void {
    if (this.inFlight.get(record.id) !== pending) return;
    this.inFlight.delete(record.id);
    if (pending.call === 'open') return this.applyQuestions(record, pending.accumulated);
    const turn = pending.turn;
    if (turn) delete turn.streaming;
    if (!this.applyChart(record, pending.accumulated, turn) && turn) {
      // The refusal reason is already on the record from `applyChart`; this only gives the turn
      // something to read, and deliberately commits nothing, which would clear that reason.
      turn.response = 'The model answered with something I could read as a chart, but not with one I could use.';
    }
  }

  private applyQuestions(record: VisualizationRecord, reply: string): void {
    const questions = parseQuestions(reply);
    if (!questions) {
      this.options.commit(record, 'The model did not return any questions I could read.');
      return;
    }
    record.questions = questions;
    this.options.commit(record);
  }

  // A chart naming a column the table does not have is not stored, and neither is one whose measure
  // is not numeric: the tab would open on a plot area with nothing in it. Every refusal here commits
  // exactly once, with its reason, and the caller commits nothing more — a second commit with no
  // reason would clear the one just recorded, and the tab would show neither a chart nor a failure.
  // The turn is passed in rather than looked up. It used to be found by searching for the one still
  // marked streaming, which stopped working the moment the caller cleared that flag above — so the
  // model's own words were dropped on the floor and the turn rendered empty.
  private applyChart(
    record: VisualizationRecord,
    reply: string,
    turn?: VisualizationTurnView,
  ): boolean {
    const parsed = parseChart(reply);
    if (!parsed) {
      this.options.commit(record, 'The model did not return a chart I could read.');
      return false;
    }
    const verdict = validateChart(parsed.chart, record.table);
    if ('error' in verdict) {
      this.options.commit(record, `The model asked for a chart this data cannot show: ${verdict.error}.`);
      return false;
    }
    const previous = record.chart;
    const redrawn = previous?.kind !== parsed.chart.kind
      || previous.x !== parsed.chart.x
      || previous.y !== parsed.chart.y
      || previous.series !== parsed.chart.series;
    record.chart = parsed.chart;
    if (isUntitled(record) && redrawn) record.title = visualizationTitle(parsed.chart.title);
    if (turn) turn.response = parsed.note || chartSummary(parsed.chart);
    this.options.commit(record);
    return true;
  }

  private fail(record: VisualizationRecord, pending: InFlight, message: string): void {
    if (this.inFlight.get(record.id) !== pending) return;
    this.inFlight.delete(record.id);
    this.options.pool.close(record.id);
    const reason = isRateLimitError(message) ? `Rate limited: ${message}` : message;
    this.options.commit(record, reason);
  }
}

function tableOf(record: VisualizationRecord): Table {
  return { columns: record.table?.columns ?? [], rows: record.table?.rows ?? [] };
}

// What a chart is now, in one sentence, for the case where the model changed it and said nothing.
// Composed from the specification rather than invented: a sentence built from what the chart
// demonstrably is is worth reading, where an invented explanation would be worse than the empty reply
// it replaces. The model's own words always win — this is only reached when there are none.
export function chartSummary(chart: VisualizationChartView): string {
  const split = chart.series === undefined ? '' : `, split by ${chart.series}`;
  return `Now a ${chart.kind} chart of ${chart.y} by ${chart.x}${split}.`;
}
