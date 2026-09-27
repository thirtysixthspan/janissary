import { messageBus, type Subscription } from '../bus.js';
import type { Managers } from '../managers.js';
import type {
  ConversationModelPair,
  VisualizationColumnType,
  VisualizationsView,
} from '../protocol.js';
import { AcpSessionPool } from '../acp/session-pool.js';
import { readSource } from './fetch.js';
import { VisualizationIndex } from './index.js';
import { VisualizationInterviewer } from './interview.js';
import { VisualizationRefresh } from './refresh.js';
import { reader } from './reading.js';
import { VisualizationReview } from './review.js';
import { defaultSourceRoots, parseSource, type SourceRoots } from './source.js';
import {
  VisualizationStore, freshVisualization, isCataloguedPair,
} from './store.js';
import type { VisualizationRecord } from './store.js';
import {
  availableVisualizationModels, interviewComplete, pendingQuestion, titled,
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
  private readonly index: VisualizationIndex;
  private readonly review: VisualizationReview;
  private readonly interviewer: VisualizationInterviewer;
  private readonly tabRemoved: Subscription;
  private readonly refresh: VisualizationRefresh;
  private readonly readOnce: (id: string) => void;
  private readonly roots: SourceRoots;

  constructor(private managers: Managers, options: ManagerOptions = {}) {
    this.store = options.store ?? new VisualizationStore();
    this.now = options.now ?? Date.now;
    this.roots = defaultSourceRoots(options.projectDir ?? this.managers.tab.launchDir);
    this.index = new VisualizationIndex(this.store);
    this.review = new VisualizationReview((record) => { this.commit(record); });
    this.readOnce = reader({
      read: options.read ?? ((source) => readSource(source, this.roots)),
      index: this.index,
      review: this.review,
      now: this.now,
      commit: (record, error) => { this.commit(record, error); },
    });
    this.interviewer = new VisualizationInterviewer({
      pool: options.pool ?? new AcpSessionPool(),
      workspace: (id) => this.store.ensure(id),
      now: this.now,
      changed: () => { this.changed(); },
      commit: (record, error) => { this.commit(record, error); },
    });
    this.refresh = new VisualizationRefresh(
      this.now,
      () => this.index.openIds(this.managers.tab.tabs),
      this.readOnce,
      (id) => this.index.find(id),
    );
    this.tabRemoved = messageBus.on('transcript', 'tab:removed', () => {
      queueMicrotask(() => { this.releaseClosed(); });
    });
  }

  // What the plugin is shown. Only the visualizations with an open tab are projected; see
  // `VisualizationIndex` for why that is the whole of the decision.
  view(): VisualizationsView {
    return {
      summaries: this.index.summaries(),
      windows: this.index.windows(this.index.openIds(this.managers.tab.tabs), (id) => this.interviewer.busy(id)),
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
    this.index.expectTab(id);
    this.readOnce(id);
    return true;
  }

  load(id: string): boolean {
    if (!this.index.find(id)) return false;
    this.index.expectTab(id);
    return true;
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
    // A different source is a different schema, so the review is open again whatever the old one was.
    record.reviewed = false;
    delete record.error;
    this.readOnce(id);
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
    return record?.table && record.reviewed ? this.interviewer.open(record) : false;
  }

  // The two thin ends of the review gate, which owns the rule.
  confirmSchema(id: string): boolean {
    const record = this.index.live(id);
    return record ? this.review.confirm(record) : false;
  }

  setColumnType(id: string, column: string, type: VisualizationColumnType): boolean {
    const record = this.index.live(id);
    return record ? this.review.correct(record, column, type) : false;
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
    this.readOnce(id);
    return true;
  }

  dispose(): void {
    this.tabRemoved.unsubscribe();
    this.refresh.dispose();
    this.interviewer.dispose();
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

  // A tab that closed takes its in-flight call and its pending poll with it. The call is cancelled
  // rather than abandoned because the session is a subprocess nothing else is listening to, and a
  // deleted record is released here because that is the point at which nothing can render it.
  private releaseClosed(): void {
    const open = this.index.openIds(this.managers.tab.tabs);
    for (const id of this.interviewer.ids()) {
      if (!open.includes(id)) this.cancel(id);
    }
    for (const id of this.index.ids()) {
      if (!open.includes(id)) continue;
      this.index.release(id);
    }
    this.refresh.reschedule();
  }

  private changed(): void {
    messageBus.emit('visualizations', { type: 'changed' });
  }
}
