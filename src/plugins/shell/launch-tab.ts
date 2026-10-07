import { createShellMarkerNonce, type TabPluginLaunchResult, type TabPluginServerCapabilities } from '../api.js';
import type { ShellLaunchArgument } from './parse-argument.js';
import { provisioningShell, spawnShell } from './spawn-shell.js';

// A typed `zsh`: the host names the tab and, by default, provisions a fresh workspace clone for it.
// While the clone lands the tab holds a provisioning placeholder; the ready handler then starts zsh
// at the clone's root, confined to it, and announces it in the notifications feed.
export function launchShellTab(
  capabilities: TabPluginServerCapabilities,
  instanceKey: string,
  argument: ShellLaunchArgument,
  root: string,
): TabPluginLaunchResult | undefined {
  const hookNonce = createShellMarkerNonce();
  let label = '';
  return capabilities.launchTab(
    instanceKey,
    {
      ...(argument.name && { name: argument.name }),
      ...(argument.workspace && { workspace: { offline: argument.offline } }),
    },
    (resources, start) => {
      label = start.label;
      if (start.workspaceDir !== undefined) {
        const workspace = { dir: start.workspaceDir, offline: argument.offline };
        return { title: 'shell', payload: provisioningShell({ instanceKey, cwd: start.cwd, root, workspace, hookNonce }) };
      }
      return { title: 'shell', payload: spawnShell(resources, { instanceKey, cwd: start.cwd, root, hookNonce }) };
    },
    (event, ready) => {
      const workspace = { dir: event.workspaceDir, offline: argument.offline };
      ready.updateTab(event.instanceKey, (resources) => ({
        payload: spawnShell(resources, { instanceKey, cwd: event.workspaceDir, root, workspace, hookNonce }),
      }));
      ready.notifyUser(`Shell "${label}" ready. (workspace: ${event.displayDir})`, { tab: event.instanceKey });
      if (event.sandboxNotice) ready.notifyUser(event.sandboxNotice, { tab: event.instanceKey });
    },
  );
}
