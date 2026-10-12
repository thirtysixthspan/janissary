import type { Managers } from '../managers.js';
import { notify } from '../notifications/index.js';
import { errorFirstLine } from '../error-text.js';

// `launch` marks the one origin that is not an open tab: the application opening its launch shell
// before any tab exists. `label` is then the label the opened tab takes, not a tab to look up.
export type PluginFailureOrigin = { label: string; command: string; launch?: true; invocationId?: string };

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
    if (origin.invocationId) managers.tab.appendForInvocation(origin.label, { input: origin.command, output: message }, origin.invocationId);
    else managers.tab.append(origin.label, { input: origin.command, output: message });
  }
  notify(managers, 'plugin-failure', origin.label, message);
  return message;
}
