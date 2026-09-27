import { messageBus, type Subscription } from '../bus.js';
import type { Managers } from '../managers.js';
import type { ConversationModelPair, VisualizationsView } from '../protocol.js';
import { AcpSessionPool } from '../acp/session-pool.js';
import { readSource } from './fetch.js';
import { ingest } from './ingest.js';
import { VisualizationIndex } from './index.js';
import { VisualizationInterviewer } from './interview.js';
import { VisualizationRefresh } from './refresh.js';
import { defaultSourceRoots, parseSource, type SourceRoots } from './source.js';
import {
  VisualizationStore, freshVisualization, isCataloguedPair,
} from './store.js';
import type { VisualizationRecord } from './store.js';
import {
  availableVisualizationModels, interviewComplete, pendingQuestion, titled, windowOf,
} from './view.js';

type ManagerOptions = {
  store?: VisualizationStore;
  pool?: AcpSessionPool;
  now?: () => number;
  // The project directory a local source may be read from. Defaults to the launch directory, which is
  // what the tab manager itself uses when no project was named.
  projectDir?: string;
  read?: (source: string) => Promise<{ text: string } | { error: string }>;
};

// The host's side of a visualization: it owns the records, reads the sources, drives the model, and
// publishes the slice the plugin redraws from. The plugin owns none of it — it names what the user
// asked for through the topic and reads what comes back.
export class VisualizationsManager {
  private readonly store: VisualizationStore;
  private readonly now: () => number;
  private readonly read: NonNullable<ManagerOptions['read']>;
  private readonly index: VisualizationIndex;
  private readonly interviewer: VisualizationInterviewer;
  private readonly tabRemoved: Subscription;
  private readonly refresh: VisualizationRefresh;
  private readonly reading = new Set<string>();
  private readonly roots: SourceRoots;

  constructor(private managers: Managers, options: ManagerOptions = {}) {
    this.store = options.store ?? new VisualizationStore();
    this.now = options.now ?? Date.now;
    this.roots = defaultSourceRoots(options.projectDir ?? this.managers.tab.launchDir);
    this.read = options.read ?? ((source) => readSource(source, this.roots));
    this.index = new VisualizationIndex(this.store);
    this.interviewer = new VisualizationInterviewer({
      pool: options.pool ?? new AcpSessionPool(),
      workspace: (id) => this.store.ensure(id),
      now: this.now,
      changed: () => { this.changed(); },
      commit: (record, error) => { this.commit(record, error); },
    });
    this.refresh = new VisualizationRefresh(
      this.now,
      () => this.openIds(),
      (id) => { this.readSource(id); },
      (id) => this.index.find(id),
    );
    this.tabRemoved = messageBus.on('transcript', 'tab:removed', () => {
      queueMicrotask(() => { this.releaseClosed(); });
    });
  }

  // What the plugin is shown. Only the visualizations with an open tab are projected; see
  // `VisualizationIndex` for why that is the whole of the decision.
  view(): VisualizationsView {
    const open = this.openIds();
    return {
      summaries: this.index.summaries(),
      windows: open.flatMap((id) => {
        const record = this.index.find(id);
        return record ? [windowOf(record, this.interviewer.busy(id), this.index.isDeleted(id))] : [];
      }),
      models: availableVisualizationModels(),
    };
  }

  create(id: string, source: string): boolean {
    if (this.index.find(id)) return false;
    if ('error' in parseSource(source, this.roots)) return false;
    const pair = availableVisualizationModels()[0];
    if (!pair) throw new Error('No ACP conversation models configured.');
    const record = freshVisualization(id, source, pair, this.now());
    this.index.remember(record);
    this.readSource(id);
    return true;
  }

  load(id: string): boolean {
    return this.index.find(id) !== undefined;
  }

  // A source may be replaced only while there is no chart. Past that point every answer the user gave
  // was given about the old data, and quietly starting again over them would be the worst available
  // reading of what they asked.
  setSource(id: string, source: string): boolean {
    const record = this.index.live(id);
    if (!record || record.chart !== undefined) return false;
    if ('error' in parseSource(source, this.roots)) return false;
    record.source = source.trim();
    record.questions = [];
    record.table = undefined;
    record.readAt = undefined;
    delete record.error;
    this.readSource(id);
    return true;
  }

  setModel(id: string, pair: ConversationModelPair): boolean {
    const record = this.index.live(id);
    if (!record || !isCataloguedPair(pair, availableVisualizationModels())) return false;
    this.interviewer.cancel(id);
    record.pair = pair;
    this.commit(record);
    return true;
  }

  rename(id: string, title: string): boolean {
    const record = this.index.live(id);
    const name = titled(title);
    if (!record || name === '') return false;
    record.title = name;
    this.commit(record);
    return true;
  }

  // Deleting from the index removes the record, its workspace, and its trust entry. A tab that was open
  // for it stays open and is told so, because removing its window from under it would leave it showing
  // the last thing the server broadcast with nothing to say why.
  delete(id: string): void {
    this.interviewer.forget(id);
    this.index.markDeleted(id);
    this.store.delete(id);
    this.changed();
    this.refresh.reschedule();
  }

  startInterview(id: string): boolean {
    const record = this.index.live(id);
    return record?.table ? this.interviewer.open(record) : false;
  }

  answer(id: string, questionId: string, answer: string): boolean {
    const record = this.index.live(id);
    const question = record?.questions.find((entry) => entry.id === questionId);
    if (!record || !question || question.answer !== undefined) return false;
    if (answer.trim() === '' || pendingQuestion(record) !== questionId) return false;
    question.answer = answer.trim();
    this.commit(record);
    // The last answer is what closes the interview, so it is the only one that can lead straight to a
    // chart. Anything earlier waits for the next one.
    if (interviewComplete(record)) this.interviewer.close(record);
    return true;
  }

  revise(id: string, query: string): boolean {
    const record = this.index.live(id);
    return record ? this.interviewer.revise(record, query) : false;
  }

  cancel(id: string): boolean {
    const record = this.index.find(id);
    const stopped = this.interviewer.cancel(id);
    if (record) record.turns = record.turns.filter((turn) => turn.streaming === undefined);
    return stopped;
  }

  // The interval a visualization may be set to. Zero is off, and it is the default: a visualization
  // costs one read and then nothing until the user asks for more.
  setRefresh(id: string, seconds: number): boolean {
    const record = this.index.live(id);
    if (!record || !Number.isFinite(seconds) || seconds < 0) return false;
    record.refreshSeconds = seconds;
    this.commit(record);
    return true;
  }

  refreshNow(id: string): boolean {
    if (!this.index.live(id)) return false;
    this.readSource(id);
    return true;
  }

  dispose(): void {
    this.tabRemoved.unsubscribe();
    this.refresh.dispose();
    this.interviewer.dispose();
  }

  private openIds(): string[] {
    return this.index.openIds(this.managers.tab.tabs);
  }

  private commit(record: VisualizationRecord, error?: string): void {
    record.updatedAt = this.now();
    if (error === undefined) delete record.error;
    else record.error = error;
    this.store.write(record);
    this.changed();
    // Every commit re-arms the poll. The interval and the open set both change through a commit, and
    // recomputing one timer here is cheaper than remembering to at each of the four places either can.
    this.refresh.reschedule();
  }

  // Reading is asynchronous and the view is not, so a read is started here and its result committed
  // when it lands. Two reads of one source never overlap: a second request while one is in flight is
  // dropped, which is what keeps a fast refresh interval from queueing work it cannot use. A read that
  // fails records the reason and leaves the previous table in place, so a source that stops answering
  // does not also take the chart off the screen.
  private readSource(id: string): void {
    if (this.reading.has(id)) return;
    const record = this.index.live(id);
    if (!record) return;
    this.reading.add(id);
    void this.read(record.source).then((result) => {
      this.reading.delete(id);
      const current = this.index.find(id);
      if (!current || this.index.isDeleted(id)) return;
      if ('error' in result) return this.commit(current, result.error);
      const ingested = ingest(result.text);
      if (ingested.error !== undefined) return this.commit(current, ingested.error);
      current.table = ingested.table;
      current.readAt = this.now();
      this.commit(current);
      this.interviewer.open(current);
    });
  }

  // A tab that closed takes its in-flight call and its pending poll with it. The call is cancelled
  // rather than abandoned because the session is a subprocess nothing else is listening to, and a
  // deleted record is released here because that is the point at which nothing can render it.
  private releaseClosed(): void {
    const open = this.openIds();
    for (const id of this.interviewer.ids()) {
      if (!open.includes(id)) this.cancel(id);
    }
    for (const id of this.index.ids()) {
      if (!open.includes(id)) this.index.release(id);
    }
    this.refresh.reschedule();
  }

  private changed(): void {
    messageBus.emit('visualizations', { type: 'changed' });
  }
}
