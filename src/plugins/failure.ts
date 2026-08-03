import type { Managers } from '../managers.js';
import { notify } from '../notifications.js';

export type PluginFailureOrigin = { label: string; command: string };

export function pluginFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const firstLine = message.split(/\r?\n/, 1)[0].trim().replace(/[.!?;:]+$/u, '').trim();
  return firstLine || 'Unknown failure';
}

export function pluginFailureMessage(id: string, error: unknown): string {
  return `Tab plugin "${id}" disabled: ${pluginFailureReason(error)}.`;
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
