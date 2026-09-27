import { isRateLimitError } from '../acp/rate-limit.js';
import type { ConversationModelPair, VisualizationTurnView } from '../protocol.js';
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

type InFlight = { call: Call; accumulated: string };

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

  // The call that produces the chart, once every question has an answer.
  close(record: VisualizationRecord): boolean {
    if (this.busy(record.id) || record.chart !== undefined || !record.table) return false;
    if (!interviewComplete(record)) return false;
    return this.prompt(record, 'close', chartPrompt(tableOf(record), record.questions));
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
    return this.prompt(record, 'revise', revisionPrompt(tableOf(record), record.chart, query));
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

  private prompt(record: VisualizationRecord, call: Call, text: string): boolean {
    const pending: InFlight = { call, accumulated: '' };
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
    const turn = pending.call === 'revise' ? record.turns.find((entry) => entry.streaming) : undefined;
    if (turn) delete turn.streaming;
    if (!this.applyChart(record, pending.accumulated)) {
      if (turn) turn.response = 'The model answered with something I could not read.';
      this.options.commit(record);
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
  // is not numeric: the tab would open on a plot area with nothing in it. The model's own words are
  // kept, so the user sees what it said and can ask again. Returns whether a chart was stored.
  private applyChart(record: VisualizationRecord, reply: string): boolean {
    const parsed = parseChart(reply);
    if (!parsed) return false;
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
    const turn = record.turns.find((entry) => entry.streaming !== undefined);
    if (turn) turn.response = parsed.note;
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
