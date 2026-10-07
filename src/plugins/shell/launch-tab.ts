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
  const origin = capabilities.originTab();
  const joining = origin?.remote === true;
  const offline = joining ? origin.workspace?.offline ?? false : argument.offline;
  const hookNonce = createShellMarkerNonce();
  let label = '';
  return capabilities.launchTab(
    instanceKey,
    {
      ...(argument.name && { name: argument.name }),
      ...(joining
        ? { remote: { join: true } }
        : {
          ...(argument.workspace && { workspace: { offline } }),
          ...(argument.remote !== undefined && { remote: { address: argument.remote } }),
        }),
    },
    (resources, start) => {
      label = start.label;
      if (joining) {
        if (start.workspaceDir === undefined) throw new Error('joined remote launch has no workspace');
        return {
          title: 'shell',
          payload: spawnShell(resources, {
            instanceKey, cwd: start.cwd, root, workspace: { dir: start.workspaceDir, offline }, hookNonce,
            ...(start.host && { host: start.host, prompted: false }),
          }),
        };
      }
      if (start.connectPtyId !== undefined) {
        return {
          title: 'shell',
          payload: provisioningShell({
            instanceKey, cwd: start.cwd, root, hookNonce, connectPtyId: start.connectPtyId,
            ...(start.host && { host: start.host }),
          }),
        };
      }
      if (start.workspaceDir !== undefined) {
        const workspace = { dir: start.workspaceDir, offline };
        return { title: 'shell', payload: provisioningShell({ instanceKey, cwd: start.cwd, root, workspace, hookNonce }) };
      }
      return { title: 'shell', payload: spawnShell(resources, { instanceKey, cwd: start.cwd, root, hookNonce }) };
    },
    (event, ready) => {
      const workspace = { dir: event.workspaceDir, offline };
      const host = event.host;
      ready.updateTab(event.instanceKey, (resources) => ({
        payload: spawnShell(resources, {
          instanceKey, cwd: event.workspaceDir, root, workspace, hookNonce,
          ...(host && { host, prompted: false }),
        }),
      }));
      ready.notifyUser(
        host
          ? `Shell "${label}" ready on ${host}. (workspace: ${event.displayDir})`
          : `Shell "${label}" ready. (workspace: ${event.displayDir})`,
        { tab: event.instanceKey },
      );
      if (event.sandboxNotice) ready.notifyUser(event.sandboxNotice, { tab: event.instanceKey });
    },
  );
}
