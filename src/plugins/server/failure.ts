import type { Managers } from '../../managers.js';
import { notify } from '../../notifications.js';
import { pluginFailureMessage } from '../failure.js';

export function reportPluginFailure(
  managers: Managers, pluginId: string, reason: string, originLabel: string,
): string {
  const message = pluginFailureMessage(pluginId, reason);
  if (managers.tab.tabs.some((tab) => tab.label === originLabel)) {
    managers.tab.append(originLabel, { input: '', output: message });
  }
  notify(managers, 'plugin-failure', originLabel, message);
  return message;
}
