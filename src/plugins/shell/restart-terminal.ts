import { createShellMarkerNonce, type TabPluginIntentEntry, type TabPluginServerCapabilities } from '../api.js';
import { spawnShell } from './spawn-shell.js';
import { isRestartTerminalRequest, type RestartTerminalRequest, type ShellPayload } from './shared.js';

export const restartTerminalIntent: TabPluginIntentEntry<ShellPayload, RestartTerminalRequest> = {
  payload: isRestartTerminalRequest,
  run: (tabPayload, request, capabilities: TabPluginServerCapabilities) => {
    if (tabPayload.provisioning || tabPayload.ptyId !== request.ptyId) {
      return capabilities.rejectRequest('the exited terminal is no longer current');
    }
    if (capabilities.terminalRunning(request.ptyId)) {
      return capabilities.rejectRequest('the terminal is still running');
    }
    capabilities.updateTab(tabPayload.instanceKey, (resources) => ({
      payload: spawnShell(resources, {
        instanceKey: tabPayload.instanceKey,
        cwd: tabPayload.root,
        root: tabPayload.root,
        hookNonce: createShellMarkerNonce(),
      }),
    }));
    return { restarted: true };
  },
};
