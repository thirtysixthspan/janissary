import { messageBus, type Subscription } from '../bus.js';
import type { Managers } from '../managers.js';
import type { VisualizationsView } from '../protocol.js';
import { AcpSessionPool } from '../acp/session-pool.js';
import { VisualizationAgent } from './agent.js';
import { chartById, ensureDataset } from './charts.js';
import { datasetKey } from './chart-spec.js';
import { readSource } from './fetch.js';
import { VisualizationIndex } from './index.js';
import { acquire, reader } from './reading.js';
import { dueByDataset, VisualizationRefresh } from './refresh.js';
import { addressIn, defaultSourceRoots, parseSource, type SourceRoots } from './source.js';
import { VisualizationStore, freshVisualization, isEmptyRecord } from './store.js';
import type { VisualizationRecord } from './store.js';
import { availableVisualizationModels } from './view.js';
import type { VisualizationChartRecord, VisualizationDataRef } from '../protocol.js';

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
      reacquire: (id, data) => { this.reacquire(id, data); },
      dueFor: (id) => this.dueFor(id),
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
    const record = freshVisualization(id, pair, this.now());
    this.index.remember(record);
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
    const address = addressIn(query);
    return this.agent.ask(record, query, async () => {
      if (address === undefined) {
        return this.index.live(id)?.source === ''
          ? 'They have not given you a source yet. Ask them for one.'
          : undefined;
      }
      return this.adopt(id, address);
    });
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

  cancel(id: string): boolean {
    const record = this.index.find(id);
    const stopped = this.agent.cancel(id);
    if (record) record.turns = record.turns.filter((turn) => turn.streaming === undefined);
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
  refreshChart(id: string, chartId: string): boolean {
    const record = this.index.live(id);
    const chart = record === undefined ? undefined : chartById(record, chartId);
    if (!record || !chart) return false;
    return chart.data.kind === 'source' ? this.readNow(id, chart.data) : this.reacquire(id, chart.data);
  }

  delete(id: string): void {
    this.agent.forget(id);
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

  private readNow(id: string, data: VisualizationDataRef): boolean {
    if (this.index.live(id) === undefined) return false;
    void this.readData(id, data);
    return true;
  }

  // Re-ask for a file the agent acquired. Every chart drawing from it is covered by one call, because the
  // file is the data and they all read it; the reply carries their specifications back.
  private reacquire(id: string, data: VisualizationDataRef): boolean {
    const record = this.index.live(id);
    if (!record) return false;
    if (data.kind === 'source') return this.readNow(id, data);
    const first: VisualizationChartRecord | undefined = record.charts.find((chart) => datasetKey(chart.data) === data.path);
    return first === undefined ? false : this.agent.reacquire(record, first);
  }

  // What the poll is owed, per dataset. A deleted record is not among them: the timer would keep
  // re-arming for a visualization nothing can act on any more, because every read it could ask for is
  // refused.
  private dueFor(id: string) {
    const record = this.index.live(id);
    if (record === undefined) return [];
    return dueByDataset(
      record.charts,
      (data) => record.datasets.find((entry) => entry.key === datasetKey(data))?.readAt ?? 0,
    );
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
