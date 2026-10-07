import type { Managers } from '../managers.js';
import { messageBus } from '../bus.js';
import { notify } from '../notifications/index.js';
import { unconfinedAgentCwd } from '../profile/inherited-cwd.js';
import { sandboxNotice } from '../sandbox/index.js';
import { NO_REPO, type ProvisioningWorkspace } from '../workspace/manager.js';
import { PROVISION_FAILURE_CLOSE_DELAY_MS, wireProvisioning } from '../workspace/provision-wire.js';
import type {
  TabPluginDeclaration, TabPluginLaunchFactory, TabPluginLaunchReadyHandler, TabPluginLaunchRequest,
  TabPluginPayload, TabPluginServerCapabilities,
} from './api.js';
import { declaredResources } from './declared-resources.js';
import type { PluginFailureOrigin } from './failure.js';
import { resolveLaunchLabel } from './launch-tab-label.js';
import { launchRemotePluginTab } from './launch-tab-remote.js';

// The `launchTab` capability: the host names a plugin tab, starts its workspace clone when one was
// asked for, places it at once, and runs the plugin's ready handler once the clone lands. Workspace
// creation, name checks, leftover cleanup and the clone's lifecycle stay host-owned, exactly as they
// are for an agent launch; the plugin supplies only the first payload and what readiness means.

// A later guarded call into the same plugin, which the host hands every capability object so a
// handler that outlives its own call can still be run under the same failure boundary.
export type DeferredPluginCall = {
  invoke(
    call: (capabilities: TabPluginServerCapabilities) => unknown, answeringLabel: string,
  ): Promise<{ status: 'ok' } | { status: 'rejected'; reason: string } | { status: 'failed'; error: unknown }>;
  disable(error: unknown): void;
};

export type LaunchInput = {
  managers: Managers;
  declaration: TabPluginDeclaration;
  origin: PluginFailureOrigin;
  isEnabled: () => boolean;
  validate: (value: TabPluginPayload) => void;
  deferred?: DeferredPluginCall;
};

const NO_REPO_REASON = 'no git repository found';
const NO_ORIGIN_REASON = 'the repository has no "origin" remote';

function startClone(
  managers: Managers, label: string, request: TabPluginLaunchRequest,
): { clone?: ProvisioningWorkspace; fallbackReason?: string } {
  if (!request.workspace) return {};
  const created = managers.workspace.create(label);
  if ('error' in created) return { fallbackReason: created.error === NO_REPO ? NO_REPO_REASON : NO_ORIGIN_REASON };
  return { clone: created };
}

function startDirectory(managers: Managers, origin: PluginFailureOrigin, clone?: ProvisioningWorkspace): string {
  if (clone) return clone.dir;
  const creator = origin.launch ? undefined : managers.tab.byLabel(origin.label);
  if (!creator) return managers.tab.launchDir;
  return unconfinedAgentCwd(creator, managers.tab.cwdOf(creator.label), managers.tab.launchDir);
}

function ownTabExists(managers: Managers, pluginId: string, label: string): boolean {
  return managers.tab.byLabel(label)?.plugin?.id === pluginId;
}

function launchedTab(managers: Managers, pluginId: string, instanceKey: string) {
  return managers.tab.pluginTabByInstanceKey(pluginId, instanceKey);
}

function releaseClone(managers: Managers, label: string, clone: ProvisioningWorkspace): void {
  managers.workspace.cancel(label);
  managers.workspace.release(clone.dir);
}

function failLaunch(managers: Managers, input: LaunchInput, label: string, instanceKey: string, reason: string): void {
  notify(managers, 'manual', input.origin.label, `Failed to create workspace for "${label}": ${reason}`);
  setTimeout(() => {
    const tab = launchedTab(managers, input.declaration.id, instanceKey);
    if (!tab) return;
    managers.tab.closeTab(managers.tab.findIndex(tab.label));
  }, PROVISION_FAILURE_CLOSE_DELAY_MS);
}

async function runReady(
  input: LaunchInput, label: string, instanceKey: string, clone: ProvisioningWorkspace,
  ready: TabPluginLaunchReadyHandler,
): Promise<void> {
  const { managers, declaration, deferred } = input;
  const tab = launchedTab(managers, declaration.id, instanceKey);
  if (tab) tab.plugin.busy = false;
  messageBus.emit('state', { type: 'dirty' });
  if (!deferred || !input.isEnabled()) return;
  const notice = sandboxNotice();
  const outcome = await deferred.invoke((capabilities) => ready({
    instanceKey,
    workspaceDir: clone.dir,
    displayDir: managers.tab.shorten(clone.dir),
    ...(notice && { sandboxNotice: notice }),
  }, capabilities), label);
  if (outcome.status === 'rejected' && launchedTab(managers, declaration.id, instanceKey)) {
    failLaunch(managers, input, label, instanceKey, outcome.reason);
  } else if (outcome.status === 'failed') {
    deferred.disable(outcome.error);
  }
}

// Opens the tab under its resolved label, answering whether it is there. A clone started for a tab
// that never opened has no owner to release it, so it is released here.
function openLaunched(
  input: LaunchInput, label: string, instanceKey: string, request: TabPluginLaunchRequest,
  factory: TabPluginLaunchFactory, clone?: ProvisioningWorkspace,
): boolean {
  const { managers, declaration, origin } = input;
  const cwd = startDirectory(managers, origin, clone);
  const workspace = clone && { dir: clone.dir, offline: request.workspace?.offline ?? false };
  try {
    managers.tab.openPluginTab(
      declaration.id, declaration.tabLabelPrefix, instanceKey, declaration.payloadSchemaVersion, origin.label,
      (resources) => {
        const created = factory(declaredResources(declaration, resources), {
          label, cwd, ...(clone && { workspaceDir: clone.dir }),
        });
        input.validate(created);
        return created;
      },
      { label, cwd, ...(workspace && { workspace }) },
    );
  } catch (error) {
    if (clone) releaseClone(managers, label, clone);
    throw error;
  }
  const opened = ownTabExists(managers, declaration.id, label);
  if (!opened && clone) releaseClone(managers, label, clone);
  return opened;
}

function awaitClone(
  input: LaunchInput, label: string, instanceKey: string, clone: ProvisioningWorkspace,
  ready: TabPluginLaunchReadyHandler,
): void {
  const { managers, declaration } = input;
  const tab = launchedTab(managers, declaration.id, instanceKey);
  if (tab) tab.plugin.busy = true;
  messageBus.emit('state', { type: 'dirty' });
  wireProvisioning(
    label, clone.ready, () => launchedTab(managers, declaration.id, instanceKey) !== undefined,
    () => { void runReady(input, label, instanceKey, clone, ready); },
    (message) => { failLaunch(managers, input, label, instanceKey, message); },
  );
}

export function launchCapabilities(input: LaunchInput): Pick<TabPluginServerCapabilities, 'launchTab'> {
  const { managers, declaration, origin, isEnabled } = input;
  return {
    launchTab: (instanceKey, request, factory, ready) => {
      if (!isEnabled()) return;
      if (!input.deferred) throw new Error('"launchTab" is not available from a notification or host-state handler');
      if (!origin.launch && !managers.tab.byLabel(origin.label)) return;
      if (request.remote !== undefined) return launchRemotePluginTab(input, instanceKey, request, factory, ready);
      const label = resolveLaunchLabel(managers, declaration, origin, request);
      if (label === undefined) return;
      const { clone, fallbackReason } = startClone(managers, label, request);
      if (!openLaunched(input, label, instanceKey, request, factory, clone)) return;
      if (clone) awaitClone(input, label, instanceKey, clone, ready);
      return { label, ...(fallbackReason && { fallbackReason }) };
    },
  };
}
