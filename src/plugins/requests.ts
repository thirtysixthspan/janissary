import type { Managers } from '../managers.js';
import type { TabPluginActivation, TabPluginServerCapabilities } from './api.js';
import { isJsonCompatible } from './context.js';
import { pluginFailureMessage, type PluginFailureOrigin } from './failure.js';
import type { PluginCallOutcome } from './invoke.js';
import type { PluginRecord } from './status.js';

// The two entry points a connected client addresses to a plugin *tab* rather than to a plugin: an
// intent it wants answered, and a failure its own rendering hit. Both resolve the owning plugin from
// the tab's record rather than trusting the wire, which is why they live together and apart from the
// opener/command paths the host dispatches by declaration.

// Why a tab the client still believes in is gone. A plugin disabled out from under it reads better
// than a bare "not found", so a tab whose plugin was disabled reports that plugin's own reason.
export function closedTabReason(
  records: ReadonlyMap<string, PluginRecord>,
  disabledTabPlugins: ReadonlyMap<string, string>,
  tabLabel: string,
): string {
  const disabledId = disabledTabPlugins.get(tabLabel);
  const disabled = disabledId ? records.get(disabledId) : undefined;
  return disabled?.state === 'disabled'
    ? pluginFailureMessage(disabled.declaration.id, disabled.reason)
    : `Plugin tab "${tabLabel}" not found`;
}

export type PluginRequestPort = {
  managers: Managers;
  record(id: string): PluginRecord | undefined;
  closedTabReason(tabLabel: string): string;
  ensureActive(
    record: PluginRecord, origin: PluginFailureOrigin,
  ): Promise<TabPluginActivation | undefined>;
  invoke(
    record: PluginRecord,
    activation: TabPluginActivation,
    origin: PluginFailureOrigin,
    call: (capabilities: TabPluginServerCapabilities) => unknown,
  ): Promise<PluginCallOutcome<unknown>>;
  disable(record: PluginRecord, error: unknown, origin: PluginFailureOrigin): string;
};

// Resolve the plugin that owns a tab, or explain why the request cannot be served. Throwing here
// answers the waiting client with an RPC error and leaves every plugin exactly as it was.
function ownerOf(port: PluginRequestPort, tabLabel: string, missing?: string) {
  const tab = port.managers.tab.tabs.find((candidate) => candidate.label === tabLabel);
  if (!tab?.plugin) throw new Error(missing ?? port.closedTabReason(tabLabel));
  const record = port.record(tab.plugin.id);
  if (!record) throw new Error(`Unknown tab plugin "${tab.plugin.id}"`);
  return { tab, plugin: tab.plugin, record };
}

export async function runPluginIntent(
  port: PluginRequestPort, tabLabel: string, intent: string, payload: unknown,
): Promise<unknown> {
  const { plugin, record } = ownerOf(port, tabLabel);
  if (record.state === 'disabled') {
    throw new Error(pluginFailureMessage(record.declaration.id, record.reason));
  }
  const origin = { label: plugin.sourceLabel, command: '' };
  const activation = await port.ensureActive(record, origin);
  if (!activation) throw new Error(pluginFailureMessage(record.declaration.id, record.reason));

  const outcome = await port.invoke(record, activation, origin, (capabilities) => activation.intent(
    { tab: tabLabel, intent, payload, tabPayload: plugin.payload }, capabilities,
  ));
  if (outcome.status === 'rejected') throw new Error(outcome.reason);
  if (outcome.status === 'failed') {
    throw new Error(port.disable(record, outcome.error, origin), { cause: outcome.error });
  }
  if (isJsonCompatible(outcome.value)) return outcome.value;
  throw new Error(port.disable(record, new Error('produced an invalid intent result'), origin));
}

export function reportClientFailure(
  port: PluginRequestPort, tabLabel: string, reason: string,
): void {
  const { plugin, record } = ownerOf(port, tabLabel, `Plugin tab "${tabLabel}" not found`);
  port.disable(record, reason, { label: plugin.sourceLabel, command: '' });
}
