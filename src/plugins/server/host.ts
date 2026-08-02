import type { Managers } from '../../managers.js';
import { availableCommands } from '../../commands.js';
import { coreCommands } from '../../commands/index.js';
import { coreOpeners } from '../../openers/index.js';
import { CORE_MIME } from '../../mime-types.js';
import type { PluginIntentReply, PluginIntentRequest } from '../../protocol.js';
import {
  TAB_PLUGIN_ACTIVATION_BUDGET_MS, TAB_PLUGIN_API_VERSION, TAB_PLUGIN_HANDLER_BUDGET_MS,
} from '../api.js';
import { pluginManifests } from '../manifests.js';
import { serverPluginLoaders } from './loaders.js';
import { catalogErrors, catalogLoaderErrors } from './catalog.js';
import { reportPluginFailure } from './failure.js';
import { failureReason } from '../failure.js';
import { withBudget } from '../budget.js';
import { apiCompatible, disposeActivation, validatePluginActivation } from './runtime.js';
import { serverCapabilities } from './capabilities.js';
import { dispatchPluginIntent } from './host-intents.js';
import type { PluginEntry, PluginHostOptions, PluginStatus } from './host-types.js';

export class PluginHost {
  private entries = new Map<string, PluginEntry>();
  private disposed = new WeakSet<object>();
  private stopped = false;
  private activationBudgetMs: number;
  private handlerBudgetMs: number;
  private now: () => number;

  constructor(private managers: Managers, options: PluginHostOptions = {}) {
    const declarations = options.declarations ?? pluginManifests;
    const loaders = options.loaders ?? serverPluginLoaders;
    this.activationBudgetMs = options.activationBudgetMs ?? TAB_PLUGIN_ACTIVATION_BUDGET_MS;
    this.handlerBudgetMs = options.handlerBudgetMs ?? TAB_PLUGIN_HANDLER_BUDGET_MS;
    this.now = options.now ?? (() => performance.now());
    const errors = catalogErrors(declarations, coreCommands, availableCommands, coreOpeners, CORE_MIME);
    for (const [id, reason] of catalogLoaderErrors(declarations, loaders)) errors.set(id, reason);
    for (const declaration of declarations) {
      this.entries.set(declaration.id, { declaration, loader: loaders[declaration.id], reason: errors.get(declaration.id) });
    }
  }

  status(pluginId: string): PluginStatus {
    const entry = this.entries.get(pluginId);
    if (!entry) return { state: 'unknown' };
    const common = { activationMs: entry.activationMs, reason: entry.reason };
    if (entry.reason) return { state: 'disabled', ...common };
    if (entry.activation) return { state: 'active', ...common };
    if (entry.activationPromise) return { state: 'activating', ...common };
    return { state: 'inactive', ...common };
  }

  async runCommand(pluginId: string, name: string, command: string, originLabel: string): Promise<void> {
    try {
      const entry = await this.activeEntry(pluginId, originLabel);
      const handler = entry.activation?.commands?.[name];
      if (!handler) throw new Error(`command handler "${name}" is missing`);
      await this.guarded(entry, originLabel, () => handler(command, { originLabel }));
    } catch { /* failure is already contained and reported */ }
  }

  async runOpener(pluginId: string, action: 'inline' | 'external', file: string, originLabel: string): Promise<void> {
    try {
      const entry = await this.activeEntry(pluginId, originLabel);
      const handler = entry.activation?.opener?.[action];
      if (!handler) throw new Error(`opener handler "${action}" is missing`);
      await this.guarded(entry, originLabel, () => handler(file, { originLabel }));
    } catch { /* failure is already contained and reported */ }
  }

  pluginIntent(request: PluginIntentRequest): Promise<PluginIntentReply> {
    return dispatchPluginIntent({
      managers: this.managers,
      entry: (pluginId) => this.entries.get(pluginId),
      activeEntry: (pluginId, originLabel) => this.activeEntry(pluginId, originLabel),
      guarded: (entry, originLabel, call) => this.guarded(entry, originLabel, call),
      disable: (entry, error) => this.disable(entry, error),
      report: (entry, originLabel) => this.report(entry, originLabel),
    }, request);
  }

  async dispose(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    await Promise.all([...this.entries.values()].map(async (entry) => {
      await entry.activationPromise;
      if (entry.activation) await disposeActivation(entry.activation, this.disposed, this.handlerBudgetMs);
    }));
  }

  private async activeEntry(pluginId: string, originLabel: string): Promise<PluginEntry> {
    const entry = this.entries.get(pluginId);
    if (!entry) throw new Error(`unknown tab plugin "${pluginId}"`);
    if (!entry.activationPromise && !entry.reason) entry.activationPromise = this.activate(entry);
    await entry.activationPromise;
    if (entry.reason || !entry.activation) throw new Error(this.report(entry, originLabel));
    return entry;
  }

  private async activate(entry: PluginEntry): Promise<void> {
    if (!apiCompatible(TAB_PLUGIN_API_VERSION, entry.declaration.requiredApiVersion)) {
      entry.reason = `requires tab plugin API ${entry.declaration.requiredApiVersion.major}.${entry.declaration.requiredApiVersion.minor}; host provides ${TAB_PLUGIN_API_VERSION.major}.${TAB_PLUGIN_API_VERSION.minor}`;
      return;
    }
    const started = this.now();
    const load = async () => {
      if (!entry.loader) throw new Error('server behavior loader is missing');
      const module = await entry.loader();
      return module.activate(serverCapabilities(this.managers, entry));
    };
    const work = load();
    try {
      const activation = await withBudget(work, this.activationBudgetMs, 'activation');
      entry.activationMs = this.now() - started;
      validatePluginActivation(entry.declaration, activation);
      if (this.stopped || entry.reason) await disposeActivation(activation, this.disposed, this.handlerBudgetMs);
      else entry.activation = activation;
    } catch (error) {
      entry.activationMs = this.now() - started;
      entry.reason ??= failureReason(error);
      void work.then((activation) => disposeActivation(activation, this.disposed, this.handlerBudgetMs), () => {});
    }
  }

  private async guarded<T>(entry: PluginEntry, originLabel: string, call: () => T | Promise<T>): Promise<T> {
    try {
      const invoke = async () => call();
      return await withBudget(invoke(), this.handlerBudgetMs, 'handler');
    } catch (error) {
      await this.disable(entry, error);
      throw new Error(this.report(entry, originLabel), { cause: error });
    }
  }

  private async disable(entry: PluginEntry, error: unknown): Promise<void> {
    entry.reason ??= failureReason(error);
    if (entry.activation) await disposeActivation(entry.activation, this.disposed, this.handlerBudgetMs);
  }

  private report(entry: PluginEntry, originLabel: string): string {
    return reportPluginFailure(this.managers, entry.declaration.id, entry.reason ?? 'unknown failure', originLabel);
  }
}
