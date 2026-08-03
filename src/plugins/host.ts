import type { Managers } from '../managers.js';
import type {
  TabPluginActivation, TabPluginDeclaration, TabPluginLoaders, TabPluginServerCapabilities,
} from './api.js';
import { activatePlugin, disposePluginActivation } from './activate.js';
import { tabPluginCatalog } from './catalog.js';
import { isJsonCompatible } from './context.js';
import {
  pluginFailureMessage, pluginFailureReason, reportPluginFailure, type PluginFailureOrigin,
} from './failure.js';
import { invokePlugin, type PluginCallOutcome } from './invoke.js';
import { tabPluginLoaders } from './loaders.js';
import { contributionRejection } from './rejections.js';
import { recordStatus, type PluginRecord, type TabPluginStatus } from './status.js';
import { closePluginTabs } from './teardown.js';

export type { TabPluginStatus } from './status.js';

export type TabPluginHostOptions = {
  activationTimeoutMs?: number;
  handlerTimeoutMs?: number;
};

export class TabPluginHost {
  private readonly records = new Map<string, PluginRecord>();
  private readonly disabledTabPlugins = new Map<string, string>();
  private readonly activationTimeoutMs: number;
  private readonly handlerTimeoutMs: number;
  private disposed = false;

  constructor(
    private managers: Managers,
    declarations: readonly TabPluginDeclaration[] = tabPluginCatalog,
    private loaders: TabPluginLoaders = tabPluginLoaders,
    options: TabPluginHostOptions = {},
  ) {
    this.activationTimeoutMs = options.activationTimeoutMs ?? 1000;
    this.handlerTimeoutMs = options.handlerTimeoutMs ?? 5000;
    for (const declaration of declarations) {
      if (this.records.has(declaration.id)) {
        throw new Error(`Duplicate tab plugin id "${declaration.id}"`);
      }
      // A claim the registries refused at module load starts life already disabled, rather than
      // having taken the app down with it while those registries were being built.
      const rejection = contributionRejection(declaration.id);
      this.records.set(declaration.id, rejection === undefined
        ? { declaration, state: 'declared' }
        : { declaration, state: 'disabled', reason: rejection });
    }
  }

  get declarations(): readonly TabPluginDeclaration[] {
    return [...this.records.values()].map((record) => record.declaration);
  }

  statusFor(id: string): TabPluginStatus | undefined {
    const record = this.records.get(id);
    return record && recordStatus(record);
  }

  async runOpener(
    id: string,
    presentation: 'inline' | 'external',
    file: string,
    origin: PluginFailureOrigin,
  ): Promise<void> {
    await this.runGuarded(id, origin, (activation, capabilities) =>
      activation.opener[presentation](file, capabilities));
  }

  async runCommand(id: string, command: string, origin: PluginFailureOrigin): Promise<void> {
    const argument = command.trim().replace(/^\S+\s*/u, '');
    await this.runGuarded(id, origin, (activation, capabilities) => activation.command
      ? activation.command(argument, capabilities)
      : capabilities.rejectRequest(`Tab plugin "${id}" claims a command but provides no handler`));
  }

  async intent(tabLabel: string, intent: string, payload: unknown): Promise<unknown> {
    const tab = this.managers.tab.tabs.find((candidate) => candidate.label === tabLabel);
    if (!tab?.plugin) throw new Error(this.closedTabReason(tabLabel));
    const record = this.records.get(tab.plugin.id);
    if (!record) throw new Error(`Unknown tab plugin "${tab.plugin.id}"`);
    if (record.state === 'disabled') {
      throw new Error(pluginFailureMessage(record.declaration.id, record.reason));
    }
    const origin = { label: tab.plugin.sourceLabel, command: '' };
    const activation = await this.ensureActive(record, origin);
    if (!activation) throw new Error(pluginFailureMessage(record.declaration.id, record.reason));

    const outcome = await this.invoke(record, activation, origin, (capabilities) => activation.intent(
      { tab: tabLabel, intent, payload, tabPayload: tab.plugin?.payload }, capabilities,
    ));
    if (outcome.status === 'rejected') throw new Error(outcome.reason);
    if (outcome.status === 'failed') {
      throw new Error(this.disable(record, outcome.error, origin), { cause: outcome.error });
    }
    if (isJsonCompatible(outcome.value)) return outcome.value;
    throw new Error(this.disable(record, new Error('produced an invalid intent result'), origin));
  }

  clientFailed(tabLabel: string, reason: string): void {
    const tab = this.managers.tab.tabs.find((candidate) => candidate.label === tabLabel);
    if (!tab?.plugin) throw new Error(`Plugin tab "${tabLabel}" not found`);
    const record = this.records.get(tab.plugin.id);
    if (!record) throw new Error(`Unknown tab plugin "${tab.plugin.id}"`);
    this.disable(record, reason, { label: tab.plugin.sourceLabel, command: '' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const record of this.records.values()) this.disposeActivation(record);
  }

  // Activate if needed, then make one guarded call. A rejection goes to the originating transcript
  // and leaves the plugin enabled; anything else crosses the failure boundary and disables it.
  private async runGuarded(
    id: string,
    origin: PluginFailureOrigin,
    call: (
      activation: TabPluginActivation, capabilities: TabPluginServerCapabilities,
    ) => void | Promise<void>,
  ): Promise<void> {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown tab plugin "${id}"`);
    const activation = await this.ensureActive(record, origin);
    if (!activation) return;
    const outcome = await this.invoke(record, activation, origin,
      (capabilities) => call(activation, capabilities));
    if (outcome.status === 'failed') this.disable(record, outcome.error, origin);
    else if (outcome.status === 'rejected') this.note(origin, outcome.reason);
  }

  private invoke<Result>(
    record: PluginRecord,
    activation: TabPluginActivation,
    origin: PluginFailureOrigin,
    call: (capabilities: TabPluginServerCapabilities) => Result | Promise<Result>,
  ): Promise<PluginCallOutcome<Result>> {
    return invokePlugin(
      this.managers, record.declaration, activation, origin,
      () => record.state === 'active' && !this.disposed, this.handlerTimeoutMs, call,
    );
  }

  private note(origin: PluginFailureOrigin, output: string): void {
    if (this.managers.tab.tabs.some((tab) => tab.label === origin.label)) {
      this.managers.tab.append(origin.label, { input: origin.command, output });
    }
  }

  private closedTabReason(tabLabel: string): string {
    const disabledId = this.disabledTabPlugins.get(tabLabel);
    const disabled = disabledId ? this.records.get(disabledId) : undefined;
    return disabled?.state === 'disabled'
      ? pluginFailureMessage(disabled.declaration.id, disabled.reason)
      : `Plugin tab "${tabLabel}" not found`;
  }

  private async ensureActive(
    record: PluginRecord,
    origin: PluginFailureOrigin,
  ): Promise<TabPluginActivation | undefined> {
    if (record.state === 'disabled') {
      reportPluginFailure(this.managers, record.declaration.id, record.reason, origin);
      return undefined;
    }
    if (record.activation) return record.activation;
    record.activating ??= this.startActivation(record, origin);
    return record.activating;
  }

  private async startActivation(
    record: PluginRecord,
    origin: PluginFailureOrigin,
  ): Promise<TabPluginActivation | undefined> {
    try {
      const result = await activatePlugin(
        record.declaration,
        this.loaders[record.declaration.id],
        this.activationTimeoutMs,
      );
      if (this.disposed || record.state === 'disabled') {
        disposePluginActivation(result.activation);
        return undefined;
      }
      record.activation = result.activation;
      record.activationMs = result.durationMs;
      record.state = 'active';
      return result.activation;
    } catch (error) {
      this.disable(record, error, origin);
      return undefined;
    } finally {
      record.activating = undefined;
    }
  }

  private disable(record: PluginRecord, error: unknown, origin: PluginFailureOrigin): string {
    if (record.state === 'disabled') {
      return reportPluginFailure(this.managers, record.declaration.id, record.reason, origin);
    }
    record.state = 'disabled';
    record.reason = pluginFailureReason(error);
    const message = reportPluginFailure(this.managers, record.declaration.id, error, origin);
    for (const label of closePluginTabs(this.managers, record.declaration.id)) {
      this.disabledTabPlugins.set(label, record.declaration.id);
    }
    this.disposeActivation(record);
    return message;
  }

  private disposeActivation(record: PluginRecord): void {
    if (!record.activation || record.activationDisposed) return;
    record.activationDisposed = true;
    disposePluginActivation(record.activation);
    record.activation = undefined;
  }
}
