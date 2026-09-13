import { activatePlugin, disposePluginActivation } from './activate.js';
import type { TabPluginActivation, TabPluginLoaders } from './api.js';
import type { PluginFailureOrigin } from './failure.js';
import type { PluginRecord } from './status.js';

// The activation half of a plugin's lifecycle, lifted out of the host: one attempt to move a record
// from `declared` to `active`, answering `undefined` when the plugin is disabled on the way there or
// the host disposed while the activation was in flight. It owns exactly one failure rule — a
// throwing or timing-out activation reaches `disable` through the failure boundary.
export async function startPluginActivation(
  record: PluginRecord,
  loaders: TabPluginLoaders,
  origin: PluginFailureOrigin,
  activationTimeoutMs: number,
  isLive: () => boolean,
  disable: (record: PluginRecord, error: unknown, origin: PluginFailureOrigin) => unknown,
): Promise<TabPluginActivation | undefined> {
  try {
    const result = await activatePlugin(
      record.declaration,
      loaders[record.declaration.id],
      activationTimeoutMs,
    );
    if (!isLive() || record.state === 'disabled') {
      disposePluginActivation(result.activation);
      return undefined;
    }
    record.activation = result.activation;
    record.activationMs = result.durationMs;
    record.state = 'active';
    return result.activation;
  } catch (error) {
    disable(record, error, origin);
    return undefined;
  }
}
