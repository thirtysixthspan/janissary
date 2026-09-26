import type { TabPluginOpener } from './api.js';

// The opener a plugin reached only through its own command supplies because the contract requires
// one. Its manifest claims no file extensions, so the open pipeline never routes here — but if a file
// ever does arrive, both presentations answer with a rejection naming the plugin rather than silently
// pretending to have opened something.
export function noFileOpener(pluginId: string): TabPluginOpener {
  const reason = `${pluginId} opens no files`;
  return {
    inline: (_file, capabilities) => capabilities.rejectRequest(reason),
    external: (_file, capabilities) => capabilities.rejectRequest(reason),
  };
}
