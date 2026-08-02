import type { Managers } from '../../managers.js';
import type { PluginTabRuntime } from '../../tab/types.js';
import type { OpenPluginTabRequest, OpenPluginTabResult, TabPluginActivation } from '../api.js';
import { isPluginTabEnvelope } from '../validation.js';

const OPEN_PREFIX = '/open/';

// A served-file ref is the `/open/<id>` path the client fetches; the registry is keyed by the id
// alone. Both directions go through here so neither one assumes a shape the other does not check.
function refId(ref: string): string | undefined {
  return ref.startsWith(OPEN_PREFIX) ? ref.slice(OPEN_PREFIX.length) : undefined;
}

export function openHostPluginTab(
  managers: Managers,
  definition: {
    id: string;
    labelPrefix: string;
    schemaVersion: number;
    activation: TabPluginActivation;
    allowServedFiles: () => void;
  },
  request: OpenPluginTabRequest,
): OpenPluginTabResult {
  const existing = managers.tab.focusPluginTab(definition.id, request.instanceKey);
  if (existing) return { label: existing, opened: false };
  const resourceRefs: string[] = [];
  try {
    const payload = request.create({ registerFile: (path) => {
      definition.allowServedFiles();
      const ref = managers.tab.registerFile(path);
      const id = refId(ref);
      if (id === undefined) throw new Error(`served file ref "${ref}" is not an /open/ path`);
      resourceRefs.push(id);
      return ref;
    } });
    const envelope = { pluginId: definition.id, schemaVersion: definition.schemaVersion, payload };
    const validPayload: unknown = definition.activation.validateTabPayload(payload);
    if (!isPluginTabEnvelope(envelope) || validPayload !== true) {
      throw new Error('plugin produced an invalid tab payload');
    }
    const label = managers.tab.openPluginTab(definition.labelPrefix, request.title, {
      pluginId: definition.id,
      schemaVersion: definition.schemaVersion,
      payload,
      instanceKey: request.instanceKey,
      originLabel: request.originLabel,
      resourceRefs,
    });
    return { label, opened: true };
  } catch (error) {
    for (const id of resourceRefs) managers.tab.openFiles.delete(id);
    throw error;
  }
}

export function pluginTabFilePath(
  managers: Managers, plugin: Pick<PluginTabRuntime, 'resourceRefs'>, ref: string,
): string | undefined {
  const id = refId(ref);
  return id !== undefined && plugin.resourceRefs.includes(id) ? managers.tab.openFilePath(id) : undefined;
}
