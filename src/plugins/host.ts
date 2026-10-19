import type { Managers } from '../managers.js';
import {
  type TabPluginActivation, type TabPluginDeclaration, type TabPluginLoaders,
  type TabPluginPresentation, type TabPluginServerCapabilities,
  type TabPluginReattachRecord,
} from './api.js';
import { disposePluginHost, disposePluginRecord } from './host-dispose.js';
import { tabPluginCatalog } from './catalog.js';
import { reportPluginFailure, type PluginFailureOrigin } from './failure.js';
import { errorFirstLine } from '../error-text.js';
import { invokePlugin, type PluginCallOutcome } from './invoke.js';
import { openerPresentation } from './presentation.js';
import { tabPluginLoaders } from './loaders.js';
import { TAB_PLUGIN_NOTIFY_TIMEOUT_MS } from './notifications.js';
import { TAB_PLUGIN_HOST_STATE_TIMEOUT_MS } from './host-state.js';
import { subscribeHostChannels } from './host-channels.js';
import { runPluginDefaultMenuAction } from './default-menu.js';
import { closedTabReason, reportClientFailure, runPluginIntent, type PluginRequestPort } from './requests.js';
import type { Subscription } from '../bus.js';
import { runPluginSelectionAction } from './selection.js';
import { recordStatus, type PluginRecord, type TabPluginStatus } from './status.js';
import { startPluginActivation } from './start-activation.js';
import { buildPluginRecords } from './host-records.js';
import { closePluginTabs } from './teardown.js';
import { noteInOriginTab } from './transcript-note.js';
import { openPluginSibling, runPluginCommand } from './sibling.js';
import { reattachPlugin } from './reattach.js';
import { authorizeRestartIntent } from './restart-intent-authorization.js';

export type TabPluginHostOptions = {
  activationTimeoutMs?: number;
  handlerTimeoutMs?: number;
  notifyTimeoutMs?: number;
  hostStateTimeoutMs?: number;
};

export class TabPluginHost {
  private readonly records: Map<string, PluginRecord>;
  private readonly disabledTabPlugins = new Map<string, string>();
  private readonly activationTimeoutMs: number;
  private readonly handlerTimeoutMs: number;
  private readonly subscriptions: Subscription[];
  private disposed = false;

  constructor(
    private managers: Managers,
    declarations: readonly TabPluginDeclaration[] = tabPluginCatalog,
    private loaders: TabPluginLoaders = tabPluginLoaders,
    options: TabPluginHostOptions = {},
  ) {
    this.activationTimeoutMs = options.activationTimeoutMs ?? 1000;
    this.handlerTimeoutMs = options.handlerTimeoutMs ?? 5000;
    this.records = buildPluginRecords(declarations);
    this.subscriptions = subscribeHostChannels({
      managers,
      records: () => [...this.records.values()],
      invoke: (record, activation, origin, call, timeoutMs) =>
        this.invoke(record, activation, origin, call, undefined, undefined, timeoutMs),
      disable: (record, error, origin) => { this.disable(record, error, origin); },
    }, declarations, {
      notifyMs: options.notifyTimeoutMs ?? TAB_PLUGIN_NOTIFY_TIMEOUT_MS,
      hostStateMs: options.hostStateTimeoutMs ?? TAB_PLUGIN_HOST_STATE_TIMEOUT_MS,
    });
  }

  get declarations(): readonly TabPluginDeclaration[] {
    return [...this.records.values()].map((record) => record.declaration);
  }

  statusFor(id: string): TabPluginStatus | undefined { const record = this.records.get(id); return record && recordStatus(record); }

  async runOpener(
    id: string, presentation: TabPluginPresentation, file: string, origin: PluginFailureOrigin,
  ): Promise<void> {
    await this.runGuarded(id, origin, (activation, capabilities) =>
      openerPresentation(id, activation, presentation)(file, capabilities));
  }

  async runCommand(id: string, command: string, origin: PluginFailureOrigin): Promise<void> { await this.runCommandResult(id, command, origin); }

  runCommandResult(id: string, command: string, origin: PluginFailureOrigin): Promise<PluginCallOutcome<void>> {
    return this.runGuarded(id, origin, (activation, capabilities) =>
      runPluginCommand(id, command, activation, capabilities));
  }

  isPayload(id: string, payload: unknown): boolean { return this.records.get(id)?.activation?.isPayload(payload) ?? false; }

  async openSibling(id: string, origin: PluginFailureOrigin): Promise<void> {
    const workspace = this.managers.tab.byLabel(origin.label)?.workspaceDir;
    if (workspace && this.managers.workspace.provisioning(workspace)) return;
    await this.runGuarded(id, origin, openPluginSibling);
  }

  runSelectionAction(id: string, action: string, paths: readonly string[], origin: PluginFailureOrigin): Promise<void> { return runPluginSelectionAction(this.requestPort(), id, action, paths, origin); }

  runDefaultMenuAction(id: string, action: string, selection: string, origin: PluginFailureOrigin): Promise<void> {
    return runPluginDefaultMenuAction(this.requestPort(), id, action, selection, origin);
  }

  intent(tabLabel: string, intent: string, payload: unknown): Promise<unknown> {
    if (intent === 'restart-terminal') authorizeRestartIntent(this.managers.tab.byLabel(tabLabel));
    return runPluginIntent(this.requestPort(), tabLabel, intent, payload);
  }

  clientFailed(tabLabel: string, reason: string): void { reportClientFailure(this.requestPort(), tabLabel, reason); }

  async reattach(id: string, data: TabPluginReattachRecord, origin: PluginFailureOrigin): Promise<void> {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown tab plugin "${id}"`);
    return reattachPlugin(data, { managers: this.managers, record, origin,
      ensureActive: this.ensureActive.bind(this),
      invoke: (item, activation, at, call, adoptPtyId) => this.invoke(item, activation, at, call, undefined, adoptPtyId),
      disable: (item, error, at) => { this.disable(item, error, at); } });
  }

  private requestPort(): PluginRequestPort {
    return {
      managers: this.managers,
      record: (id) => this.records.get(id),
      closedTabReason: (tabLabel) => closedTabReason(this.records, this.disabledTabPlugins, tabLabel),
      ensureActive: (record, origin) => this.ensureActive(record, origin),
      invoke: (record, activation, origin, call, answeringLabel) =>
        this.invoke(record, activation, origin, call, answeringLabel),
      disable: (record, error, origin) => this.disable(record, error, origin),
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    disposePluginHost(this.subscriptions, this.records.values());
  }

  // Activate if needed, then make one guarded call. A rejection goes to the originating transcript
  // and leaves the plugin enabled; anything else crosses the failure boundary and disables it.
  private async runGuarded(
    id: string,
    origin: PluginFailureOrigin,
    call: (
      activation: TabPluginActivation, capabilities: TabPluginServerCapabilities,
    ) => void | Promise<void>,
  ): Promise<PluginCallOutcome<void>> {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown tab plugin "${id}"`);
    const activation = await this.ensureActive(record, origin);
    if (!activation) return { status: 'failed', error: record.reason ?? `Tab plugin "${id}" did not activate` };
    const outcome = await this.invoke(record, activation, origin,
      (capabilities) => call(activation, capabilities));
    if (outcome.status === 'failed') this.disable(record, outcome.error, origin);
    else if (outcome.status === 'rejected') noteInOriginTab(this.managers, origin, outcome.reason);
    return outcome;
  }

  private invoke<Result>(
    record: PluginRecord,
    activation: TabPluginActivation,
    origin: PluginFailureOrigin,
    call: (capabilities: TabPluginServerCapabilities) => Result | Promise<Result>,
    answeringLabel?: string,
    adoptPtyId?: string,
    timeoutMs = this.handlerTimeoutMs,
  ): Promise<PluginCallOutcome<Result>> {
    return invokePlugin(
      this.managers, record.declaration, activation, origin,
      () => record.state === 'active' && !this.disposed, timeoutMs, call, answeringLabel,
      (error, failureOrigin) => { this.disable(record, error, failureOrigin); },
      adoptPtyId,
    );
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
      const activation = await startPluginActivation(
        record,
        this.loaders,
        origin,
        this.activationTimeoutMs,
        () => !this.disposed,
        (candidate, error, failureOrigin) => this.disable(candidate, error, failureOrigin),
      );
      return activation;
    } finally {
      record.activating = undefined;
    }
  }

  private disable(record: PluginRecord, error: unknown, origin: PluginFailureOrigin): string {
    if (record.state === 'disabled') {
      return reportPluginFailure(this.managers, record.declaration.id, record.reason, origin);
    }
    record.state = 'disabled';
    record.reason = errorFirstLine(error);
    const message = reportPluginFailure(this.managers, record.declaration.id, error, origin);
    for (const label of closePluginTabs(this.managers, record.declaration.id)) {
      this.disabledTabPlugins.set(label, record.declaration.id);
    }
    this.disposeActivation(record);
    return message;
  }

  private disposeActivation(record: PluginRecord): void {
    disposePluginRecord(record);
  }

}
