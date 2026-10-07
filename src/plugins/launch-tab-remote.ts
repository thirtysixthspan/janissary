import { messageBus } from '../bus.js';
import { startRemoteLaunch } from '../harness/remote-launch.js';
import { poolCandidates, suffixCandidates } from '../launch-name/check.js';
import { resolveLocalLaunchName } from '../launch-name/local.js';
import { failRemoteLaunch, reportRemoteCleanup, reportRemoteClone, type RemoteNameRetry } from '../launch-name/fail-remote.js';
import { notify } from '../notifications/index.js';
import { parseRemoteAddress } from '../remote/address.js';
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
  const parsed = parseRemoteAddress(request.remote?.address);
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
