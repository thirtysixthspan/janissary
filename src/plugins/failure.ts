import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { errorFirstLine } from '../error-text.js';

export type PluginFailureOrigin = { label: string; command: string };

// The reason a disabled plugin is recorded and reported with, kept under the name the plugin host
// and its tests use; the derivation itself is shared with the web editor plugin host.
export { errorFirstLine as pluginFailureReason } from '../error-text.js';

export function pluginFailureMessage(id: string, error: unknown): string {
  return `Tab plugin "${id}" disabled: ${errorFirstLine(error)}.`;
}

export function reportPluginFailure(
  managers: Managers,
  id: string,
  error: unknown,
  origin: PluginFailureOrigin,
): string {
  const message = pluginFailureMessage(id, error);
  if (managers.tab.tabs.some((tab) => tab.label === origin.label)) {
    managers.tab.append(origin.label, { input: origin.command, output: message });
  }
  notify(managers, 'plugin-failure', origin.label, message);
  return message;
}
