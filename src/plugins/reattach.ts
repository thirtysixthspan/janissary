import type { Managers } from '../managers.js';
import type { TabPluginActivation, TabPluginReattachRecord, TabPluginServerCapabilities } from './api.js';
import { noteInOriginTab } from './transcript-note.js';
import type { PluginFailureOrigin } from './failure.js';
import type { PluginCallOutcome } from './invoke.js';
import type { PluginRecord } from './status.js';

type ReattachPort = {
  managers: Managers;
  record: PluginRecord;
  origin: PluginFailureOrigin;
  ensureActive(record: PluginRecord, origin: PluginFailureOrigin): Promise<TabPluginActivation | undefined>;
  invoke(
    record: PluginRecord, activation: TabPluginActivation, origin: PluginFailureOrigin,
    call: (capabilities: TabPluginServerCapabilities) => void | Promise<void>,
  ): Promise<PluginCallOutcome<void>>;
  disable(record: PluginRecord, error: unknown, origin: PluginFailureOrigin): void;
};

export async function reattachPlugin(data: TabPluginReattachRecord, port: ReattachPort): Promise<void> {
  const { record, origin } = port;
  const activation = await port.ensureActive(record, origin);
  if (!activation?.reattach) return;
  const outcome = await port.invoke(record, activation, origin,
    (capabilities) => activation.reattach?.(data, capabilities));
  if (outcome.status === 'failed') port.disable(record, outcome.error, origin);
  else if (outcome.status === 'rejected') noteInOriginTab(port.managers, origin, outcome.reason);
}
