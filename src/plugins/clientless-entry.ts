import type { TabPluginActivation, TabPluginServerCapabilities } from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import type { PluginRequestPort } from './requests.js';
import type { PluginRecord } from './status.js';
import { noteInOriginTab } from './transcript-note.js';

// The pipeline behind a plugin entry point that has no client waiting on it: the default context
// menu's action and the file navigator's selection action both send their request and move on. So
// unlike a tab-bound intent, which throws to answer a waiting socket, this resolves the record,
// activates the plugin, runs the caller's dispatch under the host's call budget, and then records
// what came back — a failure disables that one plugin, a rejection goes to the originating tab's
// transcript because there is nobody else to hand it to.
//
// `dispatch` is what makes an entry point an entry point: the declaration check, the handler check,
// and the call itself are each entry's own business, and re-resolving or re-guarding them here is
// what this function exists to stop.
export async function runClientlessPluginEntry(
  port: PluginRequestPort,
  id: string,
  origin: PluginFailureOrigin,
  dispatch: (
    record: PluginRecord, activation: TabPluginActivation, capabilities: TabPluginServerCapabilities,
  ) => unknown,
): Promise<void> {
  const record = port.record(id);
  if (!record) return;
  const activation = await port.ensureActive(record, origin);
  if (!activation) return;
  const outcome = await port.invoke(record, activation, origin, (capabilities) =>
    dispatch(record, activation, capabilities));
  if (outcome.status === 'failed') port.disable(record, outcome.error, origin);
  else if (outcome.status === 'rejected') noteInOriginTab(port.managers, origin, outcome.reason);
}
