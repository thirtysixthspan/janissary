import { messageBus } from '../bus.js';
import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { readCatalog, writeCatalog, type ModelCatalog } from './catalog-file.js';
import { groupModelCatalog, summarizeModelRefresh, type ModelGroup } from './groups.js';
import { copyModelCatalog, modelCatalogsEqual } from './manager-catalog.js';
import { mergeModelCatalog, type ModelHarness, type ModelRefreshOutcomes } from './merge.js';
import { fetchAnthropicModels } from './providers/anthropic.js';
import { fetchCodexModels } from './providers/codex.js';
import { fetchOpenCodeModels } from './providers/opencode.js';
import type { ProviderOutcome } from './providers/result.js';

type ProviderFetcher = (signal: AbortSignal) => Promise<ProviderOutcome>;
type ProviderFetchers = Record<ModelHarness, ProviderFetcher>;

export type ModelCatalogManagerOptions = {
  projectDir?: string;
  providers?: Partial<ProviderFetchers>;
  writeCatalog?: typeof writeCatalog;
};

export class ModelCatalogManager {
  private catalog: ModelCatalog;
  private overridePath: string;
  private readonly projectDir: string;
  private readonly providers: ProviderFetchers;
  private readonly write: typeof writeCatalog;
  private queue: Promise<unknown> = Promise.resolve();
  private activeRefresh?: Promise<void>;
  private refreshAbort?: AbortController;
  private refreshing = false;
  private disposed = false;

  constructor(private readonly managers: Managers, options: ModelCatalogManagerOptions = {}) {
    this.projectDir = options.projectDir ?? process.cwd();
    this.write = options.writeCatalog ?? writeCatalog;
    this.providers = {
      claude: options.providers?.claude ?? fetchAnthropicModels,
      codex: options.providers?.codex ?? fetchCodexModels,
      opencode: options.providers?.opencode ?? fetchOpenCodeModels,
    };
    const read = readCatalog(this.projectDir);
    this.catalog = copyModelCatalog(read.catalog);
    this.overridePath = read.overridePath;
  }

  modelsFor(harness: string): string[] {
    return (this.catalog[harness] ?? [])
      .filter(({ disabled }) => disabled !== true)
      .map(({ id }) => id);
  }

  isKnownModel(harness: string, id: string): boolean {
    return this.modelsFor(harness).includes(id);
  }

  view(): { groups: ModelGroup[]; refreshing: boolean } {
    return { groups: groupModelCatalog(this.catalog), refreshing: this.refreshing };
  }

  reload(): void {
    if (this.disposed) return;
    const read = readCatalog(this.projectDir);
    this.overridePath = read.overridePath;
    const next = copyModelCatalog(read.catalog);
    if (modelCatalogsEqual(this.catalog, next)) return;
    this.catalog = next;
    this.publishCatalogChange();
  }

  async delete(harness: string, id: string): Promise<string | undefined> {
    if (this.disposed) return;
    return this.enqueue(async () => {
      if (this.disposed) return;
      this.reload();
      const current = this.catalog[harness]?.find((record) => record.id === id);
      if (!current || current.hidden === true || current.disabled === true) {
        return `no model "${harness} ${id}"`;
      }
      const candidate = copyModelCatalog(this.catalog);
      const record = candidate[harness]?.find((value) => value.id === id);
      if (!record) return `no model "${harness} ${id}"`;
      record.disabled = true;
      record.hidden = true;
      try {
        this.write(this.overridePath, candidate);
      } catch {
        this.report(`Could not write known-models.json at ${this.overridePath}.`);
        return;
      }
      this.catalog = candidate;
      this.publishCatalogChange();
    });
  }

  refresh(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.activeRefresh) return this.activeRefresh;
    this.reload();
    const controller = new AbortController();
    this.refreshAbort = controller;
    this.setRefreshing(true);
    const active = this.runRefresh(controller.signal);
    this.activeRefresh = active;
    return active;
  }

  dispose(): void {
    this.disposed = true;
    this.refreshAbort?.abort();
  }

  private async fetchAndMerge(signal: AbortSignal): Promise<void> {
    const [claude, codex, opencode] = await Promise.all([
      this.fetch(this.providers.claude, signal),
      this.fetch(this.providers.codex, signal),
      this.fetch(this.providers.opencode, signal),
    ]);
    if (this.disposed || signal.aborted) return;
    const outcomes: ModelRefreshOutcomes = { claude, codex, opencode };
    await this.enqueue(async () => {
      if (this.disposed || signal.aborted) return;
      this.reload();
      if (this.disposed || signal.aborted) return;
      const merge = mergeModelCatalog(this.catalog, outcomes);
      if (merge.reachedHarnesses.length === 0) {
        this.report(summarizeModelRefresh(merge, outcomes));
        return;
      }
      await this.writeRefresh(merge.catalog, () => summarizeModelRefresh(merge, outcomes));
    });
  }

  private async runRefresh(signal: AbortSignal): Promise<void> {
    try {
      await this.fetchAndMerge(signal);
    } finally {
      if (this.refreshAbort?.signal === signal) {
        this.activeRefresh = undefined;
        this.refreshAbort = undefined;
        this.setRefreshing(false);
      }
    }
  }

  private async writeRefresh(candidate: ModelCatalog, summary: () => string): Promise<void> {
    try {
      this.write(this.overridePath, candidate);
    } catch {
      this.report(`Could not write known-models.json at ${this.overridePath}.`);
      return;
    }
    const changed = !modelCatalogsEqual(this.catalog, candidate);
    this.catalog = copyModelCatalog(candidate);
    if (changed) this.publishCatalogChange();
    this.emitModelsChanged();
    this.report(summary());
  }

  private async fetch(provider: ProviderFetcher, signal: AbortSignal): Promise<ProviderOutcome> {
    try {
      return await provider(signal);
    } catch (error) {
      return { status: 'failed', reason: error instanceof Error ? error.message : String(error) };
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.queue;
    const next = this.runQueued(previous, operation);
    this.queue = next;
    return next;
  }

  private async runQueued<T>(previous: Promise<unknown>, operation: () => Promise<T>): Promise<T> {
    await this.settle(previous);
    return operation();
  }

  private async settle(previous: Promise<unknown>): Promise<void> {
    try {
      await previous;
    } catch {
      // The failed action handled its own outcome; the next queued write can continue.
    }
  }

  private publishCatalogChange(): void {
    this.emitModelsChanged();
    messageBus.emit('conversations', { type: 'changed' });
    messageBus.emit('state', { type: 'dirty' });
  }

  private setRefreshing(value: boolean): void {
    if (this.refreshing === value) return;
    this.refreshing = value;
    this.emitModelsChanged();
  }

  private emitModelsChanged(): void {
    messageBus.emit('models', { type: 'changed' });
  }

  private report(message: string): void {
    const label = this.managers.tab.tabs.find((tab) => tab.plugin?.id === 'models')?.label ?? 'models';
    notify(this.managers, 'models-refresh', label, message);
  }
}
