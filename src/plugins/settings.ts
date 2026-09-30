import { getConfig, updateConfig } from '../config.js';

// The host half of the `readSettings` and `saveSettings` capabilities: one plugin's own entry in the
// config's `pluginSettings` map, addressed by the plugin's id so no plugin can reach another's.
// Kept out of `context.ts` so the capability object stays delegation, as every other capability is.

export function readPluginSettings(id: string): Record<string, unknown> {
  return { ...getConfig().pluginSettings[id] };
}

// Replaces this plugin's entry and leaves every other plugin's alone. Writing goes through
// `updateConfig`, so the file is replaced atomically, keys added by hand survive, and a failed write
// leaves both the file and the running config as they were.
export function savePluginSettings(id: string, settings: Record<string, unknown>): boolean {
  return updateConfig({ pluginSettings: { ...getConfig().pluginSettings, [id]: settings } });
}
