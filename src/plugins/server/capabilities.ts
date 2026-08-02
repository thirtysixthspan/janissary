import type { Managers } from '../../managers.js';
import { getConfig } from '../../config.js';
import { didOsOpen } from '../../openers/os-open.js';
import type { TabPluginCapability, TabPluginServerCapabilities } from '../api.js';
import { openHostPluginTab } from './host-tabs.js';
import type { PluginEntry } from './host-types.js';

// A plugin receives only the capabilities its declaration asked for. Calling an undeclared one is a
// plugin bug rather than a user error, so it throws through the ordinary guard and disables that
// plugin — the same treatment any other misuse of the contract gets.
export function requireCapability(entry: PluginEntry, capability: TabPluginCapability): void {
  if (!entry.declaration.capabilities.includes(capability)) {
    throw new Error(`capability "${capability}" was not declared`);
  }
}

export function serverCapabilities(managers: Managers, entry: PluginEntry): TabPluginServerCapabilities {
  return {
    report: (originLabel, text) => {
      requireCapability(entry, 'transcript');
      if (managers.tab.tabs.some((tab) => tab.label === originLabel)) {
        managers.tab.append(originLabel, { input: '', output: text });
      }
    },
    openPluginTab: (request) => {
      requireCapability(entry, 'plugin-tabs');
      if (!entry.activation || entry.reason) throw new Error('plugin is not active');
      return openHostPluginTab(managers, {
        id: entry.declaration.id,
        labelPrefix: entry.declaration.tab.labelPrefix,
        schemaVersion: entry.declaration.payloadSchemaVersion,
        activation: entry.activation,
        allowServedFiles: () => { requireCapability(entry, 'served-files'); },
      }, request);
    },
    externalViewer: () => {
      requireCapability(entry, 'external-viewer');
      return getConfig().externalViewers?.[entry.declaration.id] ?? '';
    },
    openExternally: (absPath, application) => {
      requireCapability(entry, 'external-open');
      return didOsOpen(absPath, application);
    },
  };
}
