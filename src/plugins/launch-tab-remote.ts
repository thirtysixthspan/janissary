import { startRemoteLaunch } from '../harness/remote-launch.js';
import { resolveLocalLaunchName } from '../launch-name/local.js';
import { failRemoteLaunch, reportRemoteCleanup, reportRemoteClone, type RemoteNameRetry } from '../launch-name/fail-remote.js';
import { notify } from '../notifications/index.js';
import { abbreviateWorkspaceDir } from '../paths.js';
import { parseRemoteAddress } from '../remote/address.js';
import { resolveRemoteLaunchAddress } from '../remote/saved-host.js';
import type { RemoteAddress } from '../remote/address.js';
import { adoptRemotePluginTab, launchJoinedRemotePluginTab, poolThenPrefix } from './launch-tab-remote-reuse.js';
import { SHELL_CLONE_DEPTH } from '../workspace/clone-depth.js';
import { wireProvisioning } from '../workspace/provision-wire.js';
import { TabPluginRejection } from './api-capabilities.js';
import type { TabPluginLaunchFactory, TabPluginLaunchReadyHandler, TabPluginLaunchRequest, TabPluginLaunchResult } from './api-launch.js';
import type { LaunchInput } from './launch-tab.js';

function launchCwd(input: LaunchInput): string {
  const { managers, origin } = input;
  if (origin.launch) return managers.tab.launchDir;
  return managers.tab.workingDirOf(origin.label);
}

function fail(
  input: LaunchInput, label: string, host: string, error: unknown, message: string, retry: RemoteNameRetry,
): void {
  failRemoteLaunch(input.managers, {
    label, kind: 'agent', error, message, retry,
    show: (text) => notify(input.managers, 'manual', input.origin.label, `Failed to start "${label}" on ${host}: ${text}`),
  });
}

export function launchRemotePluginTab(
  input: LaunchInput, instanceKey: string, request: TabPluginLaunchRequest,
  factory: TabPluginLaunchFactory, ready: TabPluginLaunchReadyHandler, tried: readonly string[] = [],
): TabPluginLaunchResult | undefined {
  if (request.remote && 'adopt' in request.remote) {
    return adoptRemotePluginTab(input, instanceKey, request, factory);
  }
  if (request.remote && 'join' in request.remote) {
    return launchJoinedRemotePluginTab(input, instanceKey, request, factory);
  }
  const address = request.remote && 'address' in request.remote ? request.remote.address : undefined;
  if (address === undefined) return undefined;
  const parsed = parseRemoteAddress(address);
  if ('error' in parsed) throw new TabPluginRejection(parsed.error);
  const resolved = resolveRemoteLaunchAddress(input.managers, input.origin.label, parsed);
  return launchAddressedRemotePluginTab(input, instanceKey, request, factory, ready, tried, resolved);
}

// The `on <address>` branch, split out so the already sizeable router stays under the line limit.
// `resolved` is captured here and reused by a name-refusal retry: re-resolving on retry could pick a
// different catalog entry and silently move the channel mid-launch.
function launchAddressedRemotePluginTab(
  input: LaunchInput, instanceKey: string, request: TabPluginLaunchRequest,
  factory: TabPluginLaunchFactory, ready: TabPluginLaunchReadyHandler, tried: readonly string[],
  resolved: RemoteAddress,
): TabPluginLaunchResult | undefined {
  const name = request.name?.trim() ?? '';
  const explicit = name !== '';
  const label = resolveLocalLaunchName(input.managers, {
    creator: input.origin.label, name, explicit, workspace: false, skip: tried,
    ...(!explicit && { candidates: poolThenPrefix(input.declaration.tabLabelPrefix) }),
  });
  if (label === undefined) return undefined;

  const retry: RemoteNameRetry = {
    creator: input.origin.label,
    ...(input.origin.runId !== undefined && { runId: input.origin.runId }),
    explicit, tried: [...tried, label],
    relaunch: (next, registerTab) => {
      const relaunched = launchAddressedRemotePluginTab(input, instanceKey, request, factory, ready, next, resolved);
      if (relaunched) registerTab(relaunched.label);
    },
  };
  const remote = startRemoteLaunch(input.managers, label, resolved, launchCwd(input), undefined, SHELL_CLONE_DEPTH);
  try {
    input.managers.tab.openPluginTab(
      input.declaration.id, input.declaration.tabLabelPrefix, instanceKey, input.declaration.payloadSchemaVersion,
      input.origin.label,
      (resources) => {
        const payload = factory(resources, { label, cwd: launchCwd(input), connectPtyId: remote.ptyId, host: resolved.host });
        input.validate(payload);
        return payload;
      },
      { label, cwd: launchCwd(input), remote: { address: resolved.address, host: resolved.host },
        ...(request.group !== undefined && { group: request.group }) },
    );
  } catch (error) {
    void remote.ready.catch(() => false);
    input.managers.remote.closeTab(label);
    throw error;
  }
  const opened = input.managers.tab.pluginTabByInstanceKey(input.declaration.id, instanceKey)?.label === label;
  if (!opened) {
    void remote.ready.catch(() => false);
    input.managers.remote.closeTab(label);
    return undefined;
  }

  const tab = input.managers.tab.byLabel(label);
  if (tab?.plugin) input.managers.tab.setPluginBusy(tab, true);
  const { managers, declaration, deferred } = input;
  const closeRetry = retry;
  const onReady = async () => {
    if (input.origin.runId && managers.agent.isAgentRun(input.origin.runId)
      && !managers.agent.isLive(input.origin.runId)) return;
    const live = managers.tab.pluginTabByInstanceKey(declaration.id, instanceKey);
    if (!live || !deferred || !input.isEnabled()
      || (input.origin.runId !== undefined && managers.agent.isAgentRun(input.origin.runId)
        && !managers.agent.isLive(input.origin.runId))) return;
    managers.tab.setPluginBusy(live, false);
    const workspace = remote.cwd();
    managers.tab.setCwd(label, workspace);
    reportRemoteCleanup(managers, closeRetry, label, resolved.host, remote.cleaned());
    reportRemoteClone(managers, closeRetry, resolved.host, remote.cloned());
    const outcome = await deferred.invoke((capabilities) => ready({
      instanceKey, workspaceDir: workspace, displayDir: abbreviateWorkspaceDir(workspace), host: resolved.host,
      ...(remote.notice() && { sandboxNotice: remote.notice() }),
    }, capabilities), label);
    if (outcome.status === 'rejected') {
      fail(input, label, resolved.host, new TabPluginRejection(outcome.reason), outcome.reason, closeRetry);
      return;
    }
    if (outcome.status === 'failed') {
      deferred.disable(outcome.error);
      return;
    }
  };
  const onFailed = (message: string, error: unknown) => fail(input, label, resolved.host, error, message, closeRetry);
  wireProvisioning(label, remote.ready, (current) => managers.tab.tabs.some((item) => item.label === current), () => {
    void onReady();
  }, onFailed);
  return { label };
}
