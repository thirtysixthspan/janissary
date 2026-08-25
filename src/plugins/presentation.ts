import {
  TabPluginRejection,
  type TabPluginActivation,
  type TabPluginPresentation,
  type TabPluginServerCapabilities,
} from './api.js';

// The handler behind one opener presentation. `inline` and `external` are required by the contract;
// only `edit` is optional, and `validateActivation` already refused a declaration that claims the
// verb without supplying one — so the throw here answers a host bug rather than anything a user can
// reach. It is the host's own rejection rather than the plugin's `rejectRequest`, for the same
// reason `runCommand`'s is: attributing it to the plugin would turn "no handler" into a capability
// violation against a plugin that may never have declared that capability.
export function openerPresentation(
  id: string,
  activation: TabPluginActivation,
  presentation: TabPluginPresentation,
): (file: string, capabilities: TabPluginServerCapabilities) => void | Promise<void> {
  const handler = activation.opener[presentation];
  if (!handler) throw new TabPluginRejection(`Tab plugin "${id}" provides no ${presentation} presentation`);
  return handler;
}
