import type { Managers } from '../../managers.js';
import type { PluginIntentReply, PluginIntentRequest } from '../../protocol.js';
import { isPluginIntentReply, isRecord } from '../validation.js';
import { requireCapability } from './capabilities.js';
import { pluginTabFilePath } from './host-tabs.js';
import type { PluginEntry } from './host-types.js';

// The slice of the host an intent needs. Passed in rather than reached for, so this module owns the
// routing rules and the host keeps owning activation, guarding, and failure state.
export type IntentHost = {
  managers: Managers;
  entry(pluginId: string): PluginEntry | undefined;
  activeEntry(pluginId: string, originLabel: string): Promise<PluginEntry>;
  guarded<T>(entry: PluginEntry, originLabel: string, call: () => T | Promise<T>): Promise<T>;
  disable(entry: PluginEntry, error: unknown): Promise<void>;
  report(entry: PluginEntry, originLabel: string): string;
};

export async function dispatchPluginIntent(
  host: IntentHost, request: PluginIntentRequest,
): Promise<PluginIntentReply> {
  const tab = host.managers.tab.tabs.find((candidate) => candidate.label === request.tab);
  if (!tab?.plugin || tab.view !== 'plugin') throw new Error(`pluginIntent: tab "${request.tab}" not found`);
  if (request.schemaVersion !== tab.plugin.schemaVersion) throw new Error('pluginIntent: payload schema version mismatch');
  const entry = host.entry(tab.plugin.pluginId);
  if (!entry) throw new Error(`pluginIntent: unknown plugin "${tab.plugin.pluginId}"`);
  const originLabel = tab.plugin.originLabel;

  // The client reports its own failures through a reserved name, so a chunk that never loaded can
  // still disable its plugin. Every other `$host/` name is refused rather than routed.
  if (request.intent === '$host/client-failure') {
    if (!isRecord(request.payload) || typeof request.payload.reason !== 'string') {
      throw new Error('pluginIntent: invalid client failure payload');
    }
    await host.disable(entry, request.payload.reason);
    throw new Error(host.report(entry, originLabel));
  }
  if (request.intent.startsWith('$host/')) throw new Error(`pluginIntent: reserved host intent "${request.intent}"`);

  const active = await host.activeEntry(entry.declaration.id, originLabel);
  const validateIntent = active.activation?.validateIntent;
  if (!validateIntent) throw new Error(`pluginIntent: invalid "${request.intent}" payload`);
  // A validator that returns false is bad client input: an ordinary RPC error. A validator that
  // throws is plugin code failing, which `guarded` turns into a disable.
  const valid: unknown = await host.guarded(active, originLabel, () => validateIntent(request.intent, request.payload));
  if (valid !== true) throw new Error(`pluginIntent: invalid "${request.intent}" payload`);

  return host.guarded(active, originLabel, async () => {
    const reply = await active.activation!.handleIntent?.(request, {
      tabLabel: tab.label,
      tabPayload: tab.plugin!.payload,
      originLabel,
      filePath: (ref) => {
        requireCapability(active, 'served-files');
        return pluginTabFilePath(host.managers, tab.plugin!, ref);
      },
    });
    if (!isPluginIntentReply(reply)
      || reply.schemaVersion !== active.declaration.payloadSchemaVersion
      || active.activation!.validateIntentReply?.(request.intent, reply.payload) !== true) {
      throw new Error('plugin returned an invalid intent reply');
    }
    return reply;
  });
}
