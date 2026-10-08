import { TabPluginRejection, type TabPluginActivation, type TabPluginServerCapabilities } from './api.js';

export function openPluginSibling(
  activation: TabPluginActivation, capabilities: TabPluginServerCapabilities,
): void | Promise<void> {
  if (!activation.openSibling) throw new TabPluginRejection('This plugin cannot open a sibling tab.');
  return activation.openSibling(capabilities);
}

export function runPluginCommand(
  id: string, command: string, activation: TabPluginActivation, capabilities: TabPluginServerCapabilities,
): void | Promise<void> {
  if (!activation.command) {
    throw new TabPluginRejection(`Tab plugin "${id}" claims a command but provides no handler`);
  }
  return activation.command(command.trim().replace(/^\S+\s*/u, ''), capabilities);
}
