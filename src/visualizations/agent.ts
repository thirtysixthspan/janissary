import { randomUUID } from 'node:crypto';
import { isRateLimitError } from '../acp/rate-limit.js';
import type { AcpSessionPool } from '../acp/session-pool.js';
import { chartSummary } from './chart-spec.js';
import { datasetFor, noticed, placed, pruned } from './charts.js';
import { remembered } from './metrics.js';
import { keepUndoable, snapshot } from './undo.js';
import { datasetKey } from './chart-spec.js';
import { MAX_CHARTS, MAX_DATASETS } from './chart-record.js';
import { chatPrompt, refreshPrompt, type PromptContext } from './prompts.js';
import { parseReply, type Reply } from './reply.js';
import { isUntitled, titled, usablePair, visualizationTitle } from './view.js';
import type { VisualizationRecord } from './store.js';
import type {
  ConversationModelPair,
  VisualizationChartRecord,
  VisualizationDataRef,
  VisualizationTurnView,
} from '../protocol.js';

// The one call a visualization makes, and nothing else. Each prompt carries the whole state it needs —
// the datasets, the charts, the exchange — so a call behaves the same on a live session and on a freshly
// connected one, and the agent subprocess is a voice rather than the memory. That is why there is no
// replay here: a killed session costs a reconnect and nothing else, which is the one place this
// feature is simpler than a conversation.
//
// It replaced a two-stage interview because the form it drove is gone. There is no opening call and no
// closing call, only `ask`, and a completion routes a reply to prose, to a merge of charts, or to both.

// What is in flight for one visualization. The turn is carried with the call rather than looked up when
// the reply ends, so a reply always has somewhere to go — and a re-acquisition has none, because a
// refresh that added a turn to the exchange every thirty seconds would bury the conversation the user
// came to have. `refreshed` is the data a re-acquisition was for, read back once its reply has landed.
type InFlight = { accumulated: string; turn?: VisualizationTurnView; refreshed?: VisualizationDataRef };

type AgentOptions = {
  pool: AcpSessionPool;
  // The workspace this record's agent is confined to, and the one directory a file it acquired may be
  // read from. Created on first use rather than at creation, so a visualization nobody ever asked
  // anything of leaves nothing on disk.
  workspace(id: string): string;
  now(): number;
  // Called after every state change the tab can see, and it is what throttles the topic: the manager
  // emits, the plugin redraws, and nothing here knows either exists.
  changed(): void;
  // Persists the record with `error` set or cleared, stamps it, and reports the change. Every
  // completion goes through here, so a chart, a reply, and a failure all land the same way.
  commit(record: VisualizationRecord, error?: string): void;
  // Called after a re-acquisition's reply has been applied, so the file the agent rewrote is read back
  // and every chart drawing from it is redrawn. Without it a live chart on agent-acquired data would
  // keep the table the previous acquisition produced, which is the opposite of keeping itself current.
  reacquired(record: VisualizationRecord, data: VisualizationDataRef): void;
  // Called before a chart is placed, for the data it names. A chart drawing from a file the agent has
  // just acquired is the one case where the data is not there yet, and this is what goes and gets it —
  // synchronously, because the host has nothing else to wait on.
  acquire(record: VisualizationRecord, data: VisualizationDataRef): void;
};

// Nothing for the host to do first, which is all a re-acquisition needs: the data is already
// there and only the agent has work to do.
const ready = (): Promise<unknown> => Promise.resolve();

export class VisualizationAgent {
  private readonly inFlight = new Map<string, InFlight>();

  constructor(private readonly options: AgentOptions) {}

  ids(): IterableIterator<string> {
    return this.inFlight.keys();
  }

  busy(id: string): boolean {
    return this.inFlight.has(id);
  }

  // A message. The turn is created before the call so the tab can show the query while the model works on
  // it, the way a conversation shows a query while its reply streams, and a second message is refused
  // outright rather than queued. `prepare` runs while the tab is already busy, so nothing can be sent in
  // between, and returns a note for the model when there is something it should know.
  ask(
    record: VisualizationRecord,
    query: string,
    prepare: () => Promise<unknown>,
  ): boolean {
    if (this.busy(record.id) || query.trim() === '') return false;
    return this.start(record, query.trim(), prepare, undefined);
  }

  // A live update re-asking the agent to re-acquire the data behind one chart. Refused while anything
  // else is in flight: one session per visualization means one stream at a time.
  reacquire(record: VisualizationRecord, chart: VisualizationChartRecord): boolean {
    if (this.busy(record.id)) return false;
    return this.start(record, '', ready, chart);
  }

  // Cancelling ends the session rather than the turn alone: `AcpSession` has no per-prompt abort, so
  // the only way to stop a stream is to kill the process. Dropping the in-flight turn is the caller's
  // job, because the caller is what holds the record.
  cancel(id: string): boolean {
    this.options.pool.close(id);
    return this.inFlight.delete(id);
  }

  dispose(): void {
    this.inFlight.clear();
    this.options.pool.dispose();
  }

  // Claims the record, creates the turn, and marks the visualization busy — all synchronously, because
  // the caller's next step is an await and anything that arrived in that gap would be a second stream.
  private start(
    record: VisualizationRecord,
    query: string,
    prepare: () => Promise<unknown>,
    chart?: VisualizationChartRecord,
  ): boolean {
    const pair: ConversationModelPair = usablePair(record.pair);
    record.pair = pair;
    const turn: VisualizationTurnView | undefined = chart === undefined
      ? { query, response: '', pair, streaming: true }
      : undefined;
    if (turn) record.turns.push(turn);
    const pending: InFlight = {
      accumulated: '',
      ...(turn && { turn }),
      ...(chart !== undefined && { refreshed: chart.data }),
    };
    this.inFlight.set(record.id, pending);
    record.updatedAt = this.options.now();
    this.options.changed();
    // The turn reaches disk here, before the call goes out, because the user can close the tab while the
    // model is still thinking and the plan promises the exchange survives that. Committing only on the
    // reply meant the one thing the user typed reached the disk through a call that might never finish.
    // The store's guard accepts a turn that is still streaming, which is what makes this safe.
    if (turn) this.options.commit(record);
    void this.run(record, pending, prepare, chart);
    return true;
  }

  private async run(
    record: VisualizationRecord,
    pending: InFlight,
    prepare: () => Promise<unknown>,
    chart?: VisualizationChartRecord,
  ): Promise<void> {
    const note = await prepare();
    // A cancellation or a deletion while the source was being read wins over a call nobody is waiting
    // for, and the turn is released rather than left streaming.
    if (this.inFlight.get(record.id) !== pending) {
      if (pending.turn) delete pending.turn.streaming;
      return;
    }
    const workspace = this.options.workspace(record.id);
    const sourceNote = typeof note === 'string' ? note : undefined;
    // The notices go in with the data, so the model is answering a question about a spike the host has
    // already measured rather than being asked to notice one itself and reaching a different conclusion
    // each time.
    const context: PromptContext = {
      workspace,
      ...(sourceNote !== undefined && { sourceNote }),
      ...(record.notices.length > 0 && { notices: record.notices }),
    };
    const text = chart === undefined ? chatPrompt(record, context) : refreshPrompt(record, chart, context);
    const session = this.options.pool.session(record.id, record.pair, workspace, {
      onError: (message) => { this.fail(record, pending, message); },
      // The one caller that may run commands: its whole purpose is to work out how to reach data a web
      // page only describes, and it is already confined to the workspace above.
      allowEveryTool: true,
    });
    session.prompt(text, {
      // Nothing is rendered from a partial reply, because a partial reply is half a JSON object and
      // half of one is not worth showing. The text accumulates and is read once, at the end.
      onChunk: (chunk) => { this.accumulate(record, pending, chunk); },
      onEnd: () => { this.complete(record, pending); },
      onError: (message) => { this.fail(record, pending, message); },
    });
  }

  private accumulate(record: VisualizationRecord, pending: InFlight, text: string): void {
    if (this.inFlight.get(record.id) === pending) pending.accumulated += text;
  }

  private complete(record: VisualizationRecord, pending: InFlight): void {
    if (this.inFlight.get(record.id) !== pending) return;
    this.inFlight.delete(record.id);
    const parsed = parseReply(pending.accumulated);
    if (pending.turn) delete pending.turn.streaming;
    if (!parsed) {
      if (pending.turn) {
        pending.turn.response = 'The model answered with something I could not read as an answer.';
      }
      this.options.commit(record, 'The model did not reply with anything I could read.');
      return;
    }
    const refreshed = pending.refreshed;
    this.apply(record, parsed, pending.turn);
    if (refreshed !== undefined) this.options.reacquired(record, refreshed);
  }

  // A reply is applied chart by chart, and one chart's refusal never costs another chart: the reason
  // joins the model's own words rather than replacing them, because a reply that drew three charts and
  // named one column wrongly has still said three useful things.
  private apply(record: VisualizationRecord, reply: Reply, turn?: VisualizationTurnView): void {
    // The copy is taken before anything moves, so a reply that removes a chart can be taken back by a turn
    // that has no other way to say so.
    const before = snapshot(record.charts);
    const refused = this.remove(record, reply.remove);
    const named = titled(reply.name ?? '');
    if (named !== '' && isUntitled(record)) record.title = named;
    // Definitions are applied before the charts, so one turn can introduce a measure and draw with it, and
    // a name is matched against what this reply defined as well as against what was already there.
    if (reply.metrics.length > 0) remembered(record, reply.metrics);
    const first = this.place(record, reply.charts, refused);
    // Whatever the reply did to the charts, the notices are the data's own account of itself rather than
    // the model's, so they are rebuilt here from what the charts now say rather than asked for.
    noticed(record);
    if (turn) keepUndoable(turn, before, record.charts);
    if (isUntitled(record) && first !== undefined) record.title = visualizationTitle(first.title);
    if (reply.followUps.length > 0) record.followUps = reply.followUps;
    else delete record.followUps;
    // What a reply leaves behind: the model's own words, then any refusal, and — when it changed a
    // chart and said nothing at all — a sentence composed from the specification, so a change never
    // lands silently.
    if (turn) {
      const said = reply.say.trim();
      turn.response = [said, ...reply.notices, ...refused].filter((line) => line !== '').join('\n\n')
        || (first === undefined ? '' : chartSummary(first));
    }
    this.options.commit(record);
  }

  private remove(record: VisualizationRecord, ids: string[]): string[] {
    const refused: string[] = [];
    for (const id of ids) {
      const before = record.charts.length;
      record.charts = record.charts.filter((chart) => chart.id !== id);
      if (record.charts.length === before) refused.push(`There is no chart "${id}" to remove.`);
    }
    if (refused.length === 0) pruned(record);
    return refused;
  }

  // The first chart the reply drew, which is the one the sentence describes and the one an untitled
  // visualization takes its name from. A chart naming a file the agent has just acquired is given that
  // data before it is placed, because the file is the only place it can be — so the check that would
  // refuse the chart comes first, or a reply naming fifty files would spend the dataset ceiling on
  // charts that were about to be refused anyway.
  private place(
    record: VisualizationRecord,
    entries: Reply['charts'],
    refused: string[],
  ): VisualizationChartRecord | undefined {
    let first: VisualizationChartRecord | undefined;
    const room = MAX_CHARTS - record.charts.length;
    if (entries.length > room) {
      refused.push(`A visualization may hold ${MAX_CHARTS} charts, and this reply named ${entries.length}.`);
    }
    for (const entry of entries.slice(0, room)) {
      if (entry.data !== undefined) {
        // A data reference the record already holds costs nothing; a new one is refused here rather than
        // after the read, because the ceiling is on what a record may carry at all and a dataset written
        // past it would make the whole record unreadable.
        if (datasetFor(record, datasetKey(entry.data)) === undefined
          && record.datasets.length >= MAX_DATASETS) {
          refused.push(`A visualization may read ${MAX_DATASETS} data sources, and this one already reads them all.`);
          continue;
        }
        this.options.acquire(record, entry.data);
      }
      const result = placed(record, entry, randomUUID);
      if ('error' in result) {
        refused.push(`Not drawn: ${result.error}.`);
        continue;
      }
      first ??= result.chart;
    }
    return first;
  }

  private fail(record: VisualizationRecord, pending: InFlight, message: string): void {
    if (this.inFlight.get(record.id) !== pending) return;
    this.inFlight.delete(record.id);
    this.options.pool.close(record.id);
    if (pending.turn) {
      delete pending.turn.streaming;
      pending.turn.response = 'The model could not be reached.';
    }
    const reason = isRateLimitError(message) ? `Rate limited: ${message}` : message;
    this.options.commit(record, reason);
  }
}
