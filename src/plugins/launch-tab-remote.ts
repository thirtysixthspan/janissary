import { messageBus } from '../bus.js';
import { startRemoteLaunch } from '../harness/remote-launch.js';
import { poolCandidates, suffixCandidates } from '../launch-name/check.js';
import { resolveLocalLaunchName } from '../launch-name/local.js';
import { failRemoteLaunch, reportRemoteCleanup, reportRemoteClone, type RemoteNameRetry } from '../launch-name/fail-remote.js';
import { notify } from '../notifications/index.js';
import { parseRemoteAddress } from '../remote/address.js';
import { isInsideRoot } from './files.js';
import { wireProvisioning } from '../workspace/provision-wire.js';
import { TabPluginRejection } from './api-capabilities.js';
import type { TabPluginLaunchFactory, TabPluginLaunchReadyHandler, TabPluginLaunchRequest, TabPluginLaunchResult } from './api-launch.js';
import type { LaunchInput } from './launch-tab.js';

function* poolThenPrefix(prefix: string): Generator<string> {
  yield* poolCandidates();
  yield* suffixCandidates(prefix);
}

function launchCwd(input: LaunchInput): string {
  const { managers, origin } = input;
  if (origin.launch) return managers.tab.launchDir;
  return managers.tab.cwdOf(origin.label) ?? managers.tab.launchDir;
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
  const name = request.name?.trim() ?? '';
  const explicit = name !== '';
  const label = resolveLocalLaunchName(input.managers, {
    creator: input.origin.label, name, explicit, workspace: false, skip: tried,
    ...(!explicit && { candidates: poolThenPrefix(input.declaration.tabLabelPrefix) }),
  });
  if (label === undefined) return undefined;

  const retry: RemoteNameRetry = {
    creator: input.origin.label, explicit, tried: [...tried, label],
    relaunch: (next) => { launchRemotePluginTab(input, instanceKey, request, factory, ready, next); },
  };
  const remote = startRemoteLaunch(input.managers, label, parsed, launchCwd(input));
  try {
    input.managers.tab.openPluginTab(
      input.declaration.id, input.declaration.tabLabelPrefix, instanceKey, input.declaration.payloadSchemaVersion,
      input.origin.label,
      (resources) => {
        const payload = factory(resources, { label, cwd: launchCwd(input), connectPtyId: remote.ptyId, host: parsed.host });
        input.validate(payload);
        return payload;
      },
      { label, cwd: launchCwd(input), remote: { address: parsed.address, host: parsed.host } },
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
  if (tab?.plugin) tab.plugin.busy = true;
  messageBus.emit('state', { type: 'dirty' });
  const { managers, declaration, deferred } = input;
  const closeRetry = retry;
  const onReady = async () => {
    const live = managers.tab.pluginTabByInstanceKey(declaration.id, instanceKey);
    if (!live || !deferred || !input.isEnabled()) return;
    live.plugin.busy = false;
    managers.tab.setCwd(label, remote.cwd());
    messageBus.emit('state', { type: 'dirty' });
    reportRemoteCleanup(managers, closeRetry, label, parsed.host, remote.cleaned());
    reportRemoteClone(managers, closeRetry, parsed.host, remote.cloned());
    const outcome = await deferred.invoke((capabilities) => ready({
      instanceKey, workspaceDir: remote.cwd(), displayDir: remote.cwd(), host: parsed.host,
      ...(remote.notice() && { sandboxNotice: remote.notice() }),
    }, capabilities), label);
    if (outcome.status === 'rejected') {
      fail(input, label, parsed.host, new TabPluginRejection(outcome.reason), outcome.reason, closeRetry);
      return;
    }
    if (outcome.status === 'failed') {
      deferred.disable(outcome.error);
      return;
    }
  };
  const onFailed = (message: string, error: unknown) => fail(input, label, parsed.host, error, message, closeRetry);
  wireProvisioning(label, remote.ready, (current) => managers.tab.tabs.some((item) => item.label === current), () => {
    void onReady();
  }, onFailed);
  return { label };
}

function adoptRemotePluginTab(
  input: LaunchInput, instanceKey: string, request: TabPluginLaunchRequest, factory: TabPluginLaunchFactory,
): TabPluginLaunchResult | undefined {
  const { managers, origin, declaration } = input;
  if (!input.reattaching) throw new TabPluginRejection('Remote process adoption is only available during reattach.');
  const adopt = request.remote && 'adopt' in request.remote ? request.remote.adopt : undefined;
  const source = managers.tab.byLabel(origin.label);
  if (!adopt || !source?.remote) throw new TabPluginRejection('A remote process can only be adopted from its resumed channel.');
  const label = request.name?.trim() ?? '';
  if (!label) throw new TabPluginRejection('An adopted remote process needs its recorded tab label.');
  if (!managers.remote.attach(label, origin.label)) return undefined;
  try {
    managers.tab.openPluginTab(
      declaration.id, declaration.tabLabelPrefix, instanceKey, declaration.payloadSchemaVersion, origin.label,
      (resources) => {
        const payload = factory(resources, {
          label, cwd: adopt.cwd, workspaceDir: adopt.workspaceDir, host: adopt.host, recordedPtyId: adopt.ptyId,
        });
        input.validate(payload);
        return payload;
      },
      { label, cwd: adopt.cwd, remote: source.remote, workspace: { dir: adopt.workspaceDir, offline: adopt.offline } },
    );
  } catch (error) {
    managers.remote.release(label);
    throw error;
  }
  return managers.tab.pluginTabByInstanceKey(declaration.id, instanceKey)?.label === label ? { label } : undefined;
}

function launchJoinedRemotePluginTab(
  input: LaunchInput, instanceKey: string, request: TabPluginLaunchRequest, factory: TabPluginLaunchFactory,
): TabPluginLaunchResult | undefined {
  const { managers, origin, declaration } = input;
  const source = managers.tab.byLabel(origin.label);
  if (!source?.remote) throw new TabPluginRejection('A remote workspace can only be joined from a remote tab.');
  const workspaceDir = managers.remote.workspaceOf(origin.label);
  if (workspaceDir === undefined) throw new TabPluginRejection('The remote workspace is not ready yet.');
  const unavailable = () => notify(managers, 'manual', origin.label, 'The remote workspace is no longer available.');
  if (managers.remote.reconnectingOf(origin.label)) { unavailable(); return undefined; }

  const name = request.name?.trim() ?? '';
  const explicit = name !== '';
  const label = resolveLocalLaunchName(managers, {
    creator: origin.label, name, explicit, workspace: false,
    ...(!explicit && { candidates: poolThenPrefix(declaration.tabLabelPrefix) }),
  });
  if (label === undefined) return undefined;
  if (!managers.remote.attach(label, origin.label)) { unavailable(); return undefined; }

  const sourceCwd = managers.tab.cwdOf(origin.label) ?? workspaceDir;
  const cwd = isInsideRoot(workspaceDir, sourceCwd) ? sourceCwd : workspaceDir;
  try {
    managers.tab.openPluginTab(
      declaration.id, declaration.tabLabelPrefix, instanceKey, declaration.payloadSchemaVersion, origin.label,
      (resources) => {
        const payload = factory(resources, { label, cwd, workspaceDir, host: source.remote?.host });
        input.validate(payload);
        return payload;
      },
      { label, cwd, remote: source.remote },
    );
  } catch (error) {
    managers.remote.release(label);
    throw error;
  }
  const opened = managers.tab.pluginTabByInstanceKey(declaration.id, instanceKey)?.label === label;
  if (!opened) {
    managers.remote.release(label);
    return undefined;
  }
  return { label };
}
