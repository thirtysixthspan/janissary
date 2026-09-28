import { messageBus, type Subscription } from '../bus.js';
import type { Managers } from '../managers.js';
import type { VisualizationsView } from '../protocol.js';
import { AcpSessionPool } from '../acp/session-pool.js';
import { VisualizationAgent } from './agent.js';
import { chartById, ensureDataset } from './charts.js';
import { datasetKey } from './chart-spec.js';
import { applied, readInstruction } from './instructions.js';
import { reverted } from './undo.js';
import { readSource } from './fetch.js';
import { VisualizationIndex } from './index.js';
import { acquire, reader } from './reading.js';
import { owedBy, VisualizationRefresh } from './refresh.js';
import { addressIn, defaultSourceRoots, parseSource, type SourceRoots } from './source.js';
import { VisualizationStore, freshVisualization, isEmptyRecord } from './store.js';
import type { VisualizationRecord } from './store.js';
import { availableVisualizationModels } from './view.js';
import type { VisualizationDataRef } from '../protocol.js';

type ManagerOptions = {
  store?: VisualizationStore;
  pool?: AcpSessionPool;
  now?: () => number;
  // The project directory a local source may be read from. Defaults to the launch directory, which is
  // what the tab manager itself uses when no project was named.
  projectDir?: string;
  read?: (source: string) => Promise<{ text: string } | { error: string }>;
};

const SOURCE: VisualizationDataRef = { kind: 'source' };

// The host's side of a visualization: it owns the records, reads the sources, drives the agent, and
// publishes the slice the plugin redraws from. The plugin owns none of it — it names what the user
// asked for through the topic and reads what comes back.
export class VisualizationsManager {
  private readonly store: VisualizationStore;
  private readonly now: () => number;
  private readonly index: VisualizationIndex;
  private readonly agent: VisualizationAgent;
  private readonly tabRemoved: Subscription;
  private readonly refresh: VisualizationRefresh;
  private readonly readData: (id: string, data: VisualizationDataRef) => Promise<unknown>;
  private readonly roots: SourceRoots;

  constructor(private managers: Managers, options: ManagerOptions = {}) {
    this.store = options.store ?? new VisualizationStore();
    this.now = options.now ?? Date.now;
    this.roots = defaultSourceRoots(options.projectDir ?? this.managers.tab.launchDir);
    this.index = new VisualizationIndex(this.store);
    const workspace = (id: string): string => this.store.ensure(id);
    this.readData = reader({
      read: options.read ?? ((source) => readSource(source, this.roots)),
      workspace,
      index: this.index,
      now: this.now,
      commit: (record, error) => { this.commit(record, error); },
    });
    this.agent = new VisualizationAgent({
      pool: options.pool ?? new AcpSessionPool(),
      workspace,
      now: this.now,
      changed: () => { this.changed(); },
      commit: (record, error) => { this.commit(record, error); },
      reacquired: (record, data) => { void this.readData(record.id, data); },
      acquire: (record, data) => { acquire(record, data, workspace(record.id), this.now()); },
    });
    this.refresh = new VisualizationRefresh({
      now: this.now,
      openIds: () => this.index.openIds(this.managers.tab.tabs),
      read: (id, data) => { void this.readData(id, data); },
      reacquire: (id, data) => { void this.reask(id, data); },
      dueFor: (id) => owedBy(this.index.live(id)),
    });
    this.tabRemoved = messageBus.on('transcript', 'tab:removed', () => {
      queueMicrotask(() => { this.releaseClosed(); });
    });
  }

  // What the plugin is shown. Only the visualizations with an open tab are projected; see
  // `VisualizationIndex` for why that is the whole of the decision.
  view(): VisualizationsView {
    return {
      summaries: this.index.summaries(),
      windows: this.index.windows(this.index.openIds(this.managers.tab.tabs), (id) => this.agent.busy(id)),
      models: availableVisualizationModels(),
    };
  }

  // A new visualization is a conversation with nothing in it, which is why it needs no source: the tab
  // prompts for one and the first message carries it. An optional first message is what the context
  // menu's **Visualize this** sends, so a selection becomes the opening turn rather than a field. An
  // empty record is not written, so a visualization opened from the index and abandoned leaves nothing
  // on disk.
  create(id: string, message?: string): boolean {
    if (this.index.find(id)) return false;
    const pair = availableVisualizationModels()[0];
    if (!pair) throw new Error('No ACP conversation models configured.');
    this.index.remember(freshVisualization(id, pair, this.now()));
    this.index.expectTab(id);
    this.changed();
    if (message !== undefined && message.trim() !== '') void this.send(id, message);
    return true;
  }

  load(id: string): boolean {
    if (!this.index.find(id)) return false;
    this.index.expectTab(id);
    return true;
  }

  // One message, and everything it implies. An address in the text becomes the source — the most
  // recent one wins, so pointing somewhere else mid-conversation is ordinary rather than refused — and
  // is read before the model is called, so the model is asked with the data in hand rather than told to
  // go and get it. The tab is busy from the moment the message is accepted, so the read counts as part
  // of the call and a second message is refused throughout it.
  send(id: string, query: string): boolean {
    const record = this.index.live(id);
    if (!record) return false;
    // A rule the user asked to be remembered is not a question, so nothing is asked: the message is applied
    // to the record and answered in one line. Asking the model to acknowledge it would cost a call and put
    // a sentence in the exchange about something the host did itself.
    const instruction = readInstruction(query);
    if (instruction.kind !== 'message') {
      applied(record, instruction);
      this.commit(record);
      return true;
    }
    // The suggestion this message came from goes the moment it is used, not when the reply that replaces
    // the row lands. The row was replaced only on the reply before, so for the whole of a reply — which
    // can be a long one — the button was still there offering the same question again, and asking it
    // twice in a row is a mistake the row should not make possible. The remaining suggestions stay: the
    // spec promises the used one cannot be asked twice, not that the rest go with it.
    const before = record.followUps;
    const used = before?.includes(query) === true ? query : undefined;
    if (used !== undefined) record.followUps = before?.filter((one) => one !== used);
    const address = addressIn(query);
    const asked = this.agent.ask(record, query, async () => {
      if (address === undefined) {
        return this.index.live(id)?.source === ''
          ? 'They have not given you a source yet. Ask them for one.'
          : undefined;
      }
      return this.adopt(id, address);
    });
    // A refused message was never sent, so the button that would have sent it is still accurate.
    if (!asked) record.followUps = before;
    return asked;
  }

  // An address the user typed, judged by exactly the rules every other route into a source is judged
  // by. A refusal is handed to the model rather than swallowed, so the exchange says why nothing was
  // read instead of the model reasoning about data that was never there.
  private async adopt(id: string, address: string): Promise<string | undefined> {
    const record = this.index.live(id);
    if (!record) return undefined;
    const parsed = parseSource(address, this.roots);
    if ('error' in parsed) return `The address ${address} was refused: ${parsed.error}.`;
    record.source = address.trim();
    // A dataset exists for the source whether or not a chart has asked for it yet, so the model is
    // shown the data it named on the very message that named it.
    ensureDataset(record, SOURCE, () => ({ key: 'source' }));
    await this.readData(id, SOURCE);
    return undefined;
  }

  // One turn taken back. A position the record does not hold, or a turn with nothing to take back, is
  // refused rather than restoring a second time: a revert that quietly did nothing is worse than one that
  // said it could not.
  undo(id: string, index: number): boolean {
    const record = this.index.live(id);
    if (record === undefined || !reverted(record, index)) return false;
    this.commit(record);
    return true;
  }

  // A cancelled reply leaves the question in the exchange with whatever answer had arrived — the user
  // stopping a reply is not the same as never having asked it, and dropping the turn here is how closing
  // a tab mid-reply used to delete what someone had typed. The empty response is honest: the model stopped,
  // and nothing pretends otherwise. The cleared state reaches the disk too, or the turn would reopen
  // claiming to still be streaming with nothing left to finish it.
  cancel(id: string): boolean {
    const record = this.index.find(id);
    const stopped = this.agent.cancel(id);
    if (record) {
      for (const turn of record.turns) delete turn.streaming;
      this.commit(record);
    }
    return stopped;
  }

  // The interval belongs to one chart, because the description attaches live update to individual
  // graphs rather than to the visualization. A refusal is a chart id the record does not hold.
  setChartRefresh(id: string, chartId: string, seconds: number): boolean {
    const record = this.index.live(id);
    const chart = record === undefined ? undefined : chartById(record, chartId);
    if (!record || !chart || !Number.isFinite(seconds) || seconds < 0) return false;
    chart.refreshSeconds = seconds;
    this.commit(record);
    return true;
  }

  // Read one chart's data now. On a chart the agent acquired this is a model call, because nothing else
  // knows how that data is reached — which is the one place a re-read costs more than a fetch.
  // Re-ask for a file the agent acquired, or read a source now. Every chart drawing from a file is covered by
  // one call, because the file is the data and they all read it.
  private reask(id: string, data: VisualizationDataRef): boolean {
    const record = this.index.live(id);
    if (record === undefined) return false;
    if (data.kind === 'source') {
      void this.readData(id, data);
      return true;
    }
    const first = record.charts.find((chart) => datasetKey(chart.data) === data.path);
    return first === undefined ? false : this.agent.reacquire(record, first);
  }

  refreshChart(id: string, chartId: string): boolean {
    const record = this.index.live(id);
    const chart = record === undefined ? undefined : chartById(record, chartId);
    if (!record || !chart) return false;
    return this.reask(id, chart.data);
  }

  delete(id: string): void {
    this.agent.cancel(id);
    this.index.markDeleted(id);
    this.store.delete(id);
    this.changed();
    this.refresh.reschedule();
  }

  dispose(): void {
    this.tabRemoved.unsubscribe();
    this.refresh.dispose();
    this.agent.dispose();
  }

  private commit(record: VisualizationRecord, error?: string): void {
    record.updatedAt = this.now();
    if (error === undefined) delete record.error;
    else record.error = error;
    if (!isEmptyRecord(record)) this.store.write(record);
    this.changed();
    // Every commit re-arms the poll. The intervals and the open set both change through a commit, and
    // recomputing one timer here is cheaper than remembering to at each of the four places either can.
    this.refresh.reschedule();
  }

  // A tab that closed takes its in-flight call and its pending poll with it. The call is cancelled
  // rather than abandoned because the session is a subprocess nothing else is listening to, and a
  // deleted record is released here because that is the point at which nothing can render it.
  private releaseClosed(): void {
    const open = this.index.openIds(this.managers.tab.tabs);
    for (const id of this.agent.ids()) {
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
