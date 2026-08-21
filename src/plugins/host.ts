import type { Managers } from '../managers.js';
import {
  TabPluginRejection,
  type TabPluginActivation, type TabPluginDeclaration, type TabPluginLoaders,
  type TabPluginServerCapabilities,
} from './api.js';
import { activatePlugin, disposePluginActivation } from './activate.js';
import { tabPluginCatalog } from './catalog.js';
import {
  pluginFailureReason, reportPluginFailure, type PluginFailureOrigin,
} from './failure.js';
import { invokePlugin, type PluginCallOutcome } from './invoke.js';
import { tabPluginLoaders } from './loaders.js';
import { subscribeTabPluginNotifications, TAB_PLUGIN_NOTIFY_TIMEOUT_MS } from './notifications.js';
import { closedTabReason, reportClientFailure, runPluginIntent, type PluginRequestPort } from './requests.js';
import type { Subscription } from '../bus.js';
import { contributionRejection } from './rejections.js';
import { runPluginSelectionAction } from './selection.js';
import { recordStatus, type PluginRecord, type TabPluginStatus } from './status.js';
import { closePluginTabs } from './teardown.js';

export type { TabPluginStatus } from './status.js';

export type TabPluginHostOptions = {
  activationTimeoutMs?: number;
  handlerTimeoutMs?: number;
  notifyTimeoutMs?: number;
};

export class TabPluginHost {
  private readonly records = new Map<string, PluginRecord>();
  private readonly disabledTabPlugins = new Map<string, string>();
  private readonly activationTimeoutMs: number;
  private readonly handlerTimeoutMs: number;
  private readonly notifications: Subscription[];
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
    this.notifications = subscribeTabPluginNotifications({
      managers,
      records: () => [...this.records.values()],
      timeoutMs: options.notifyTimeoutMs ?? TAB_PLUGIN_NOTIFY_TIMEOUT_MS,
      invoke: (record, activation, origin, call, timeoutMs) => invokePlugin(
        managers, record.declaration, activation, origin,
        () => record.state === 'active' && !this.disposed, timeoutMs, call,
      ),
      disable: (record, error, origin) => { this.disable(record, error, origin); },
    }, declarations.flatMap((declaration) => declaration.notifications ?? []));
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
    await this.runGuarded(id, origin, (activation, capabilities) => {
      // The host's own rejection, thrown directly rather than through the plugin's `rejectRequest`.
      // Routing it through the capability would attribute it to a plugin that may not have declared
      // that capability, turning a plain "no handler" answer into a capability violation.
      if (!activation.command) {
        throw new TabPluginRejection(`Tab plugin "${id}" claims a command but provides no handler`);
      }
      return activation.command(argument, capabilities);
    });
  }

  runSelectionAction(id: string, action: string, paths: readonly string[], origin: PluginFailureOrigin): Promise<void> {
    return runPluginSelectionAction(this.requestPort(), id, action, paths, origin);
  }

  intent(tabLabel: string, intent: string, payload: unknown): Promise<unknown> {
    return runPluginIntent(this.requestPort(), tabLabel, intent, payload);
  }

  clientFailed(tabLabel: string, reason: string): void {
    reportClientFailure(this.requestPort(), tabLabel, reason);
  }

  private requestPort(): PluginRequestPort {
    return {
      managers: this.managers,
      record: (id) => this.records.get(id),
      closedTabReason: (tabLabel) => closedTabReason(this.records, this.disabledTabPlugins, tabLabel),
      ensureActive: (record, origin) => this.ensureActive(record, origin),
      invoke: (record, activation, origin, call) => this.invoke(record, activation, origin, call),
      disable: (record, error, origin) => this.disable(record, error, origin),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const subscription of this.notifications) subscription.unsubscribe();
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
