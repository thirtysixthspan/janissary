import type { TabPluginActivation, TabPluginServerCapabilities } from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import type { PluginCallOutcome } from './invoke.js';
import type { PluginRecord } from './status.js';

// Background work has no originating transcript. `note` no-ops when no tab matches its origin, so an
// empty label is what stops a notification or a host-state push from appending to a transcript the
// user never pointed at this plugin (see `createPluginContext`).
export const BACKGROUND_ORIGIN: PluginFailureOrigin = { label: '', command: '' };

// What a background delivery needs from the host: the records to select from, the guarded-call path,
// and the way it disables a plugin. Both channels supply exactly these; each adds only the readers
// its own selection needs.
export type BackgroundDeliveryPort = {
  records(): readonly PluginRecord[];
  timeoutMs: number;
  invoke(
    record: PluginRecord,
    activation: TabPluginActivation,
    origin: PluginFailureOrigin,
    call: (capabilities: TabPluginServerCapabilities) => void | Promise<void>,
    timeoutMs: number,
  ): Promise<PluginCallOutcome<void>>;
  disable(record: PluginRecord, error: unknown, origin: PluginFailureOrigin): void;
};

// The guarded delivery both background channels share: run the plugin's handler under the host's
// guard, with the background origin and the channel's budget, and disable the plugin only when the
// call fails. A rejection is not a failure here — a background push is nobody's request, so it has
// no caller to answer — and the plugin keeps running.
//
// `handler` is the activation member the channel delivers through, and an absent one is a channel
// with nothing to deliver: no call is made at all.
export async function deliverBackground<Event>(
  port: BackgroundDeliveryPort,
  record: PluginRecord,
  handler: ((event: Event, capabilities: TabPluginServerCapabilities) => void | Promise<void>) | undefined,
  event: Event,
): Promise<void> {
  const activation = record.activation;
  if (!handler || !activation) return;
  const outcome = await port.invoke(
    record,
    activation,
    BACKGROUND_ORIGIN,
    (capabilities) => handler(event, capabilities),
    port.timeoutMs,
  );
  if (outcome.status === 'failed') port.disable(record, outcome.error, BACKGROUND_ORIGIN);
}
