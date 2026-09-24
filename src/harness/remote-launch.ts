import { messageBus } from '../bus.js';
import { wireProvisioning } from '../workspace/provision-wire.js';
import type { Managers } from '../managers.js';
import type { RemoteAddress } from '../remote/address.js';
import type { RemoteResume } from '../remote/resume.js';
import type { SpawnTabOptions } from './spawn-options.js';
import { LaunchCheckUnanswered, LaunchNameRefusal } from '../launch-name/refusal.js';
import { failRemoteLaunch, reportRemoteCleanup } from '../launch-name/fail-remote.js';

// The "open a channel, insert the placeholder, resolve `ready` from frames" sequence, kept out of
// `HarnessManager` — which was already split once for size (see `command-parse.ts`) — and shared by
// the harness and agent launch paths, since both need exactly this and differ only in what they do
// once the workspace is ready.

// A remote launch in flight. `ready` is the same `Promise<void>` a local `-w` clone hands
// `wireProvisioning`, so the placeholder-tab machinery is reached through one path regardless of
// which machine the clone lands on. `cwd` and `notice` are only meaningful once it resolves: the
// remote workspace's path, and the remote's own sandbox notice (isolation is the remote host's
// decision, so the notice has to come from there rather than be computed locally).
// `cleaned` is the path of a leftover workspace the remote removed before cloning this one.
export type RemoteLaunchState = {
  ptyId: string;
  ready: Promise<void>;
  cwd: () => string;
  notice: () => string | undefined;
  cleaned: () => string | undefined;
};

function closeTab(managers: Managers, label: string): void {
  const index = managers.tab.findIndex(label);
  if (index !== -1) managers.tab.closeTab(index);
}

/**
 * Open the tab's ssh channel and start its remote workspace. The tab is expected to already exist
 * as a placeholder whose terminal is attached to the returned `ptyId`, so ssh's own prompts render
 * in it and keystrokes answer them.
 *
 * A channel that dies before the workspace is ready rejects `ready`, which lands in the tab's
 * `provisionError` and closes it shortly after — leaving ssh's own failure text (unreachable host,
 * failed auth, `janus` missing on the remote PATH) visible in the meantime, since it was already
 * rendering in that terminal. For a fresh launch that rejection is a `LaunchCheckUnanswered`, since
 * the host never got to check the label. A channel that dies afterwards simply closes the tab, the
 * way a harness tab closes when its process exits.
 *
 * A host that refuses the label rejects `ready` with a `LaunchNameRefusal` instead, which the
 * failure funnel (`failRemoteLaunch`) tells apart from every other failure.
 */
export function startRemoteLaunch(
  managers: Managers, label: string, address: RemoteAddress, cwd: string, resume?: RemoteResume,
): RemoteLaunchState {
  // The channel is opened inside the executor, which runs synchronously, so `ptyId` is filled in
  // before this function returns and no resolver has to be lifted out of the promise.
  const state = {
    dir: cwd, notice: undefined as string | undefined, cleaned: undefined as string | undefined, ptyId: '', settled: false,
  };
  const ready = new Promise<void>((resolve, reject) => {
    const channel = managers.remote.create(label, address, cwd, {
      onReady: (remoteDir, remoteNotice, cleaned) => {
        state.dir = remoteDir;
        state.notice = remoteNotice;
        state.cleaned = cleaned;
        state.settled = true;
        resolve();
      },
      onNameRefused: (frame) => {
        if (state.settled) return;
        state.settled = true;
        reject(new LaunchNameRefusal(frame.label, address.host, frame.path, frame.reason));
      },
      // An attach hears about a launch that never reached an answer here, at the launch's own
      // failure funnel, rather than through a second path of its own.
      onFailed: (message) => {
        if (state.settled) { closeTab(managers, label); return; }
        state.settled = true;
        resume?.onFailed?.(message);
        reject(new Error(message));
      },
      onClosed: () => {
        if (state.settled) { closeTab(managers, label); return; }
        state.settled = true;
        const message = `Remote session to ${address.host} ended before its workspace was ready.`;
        resume?.onFailed?.(message);
        reject(resume ? new Error(message) : new LaunchCheckUnanswered(address.host, message));
      },
    }, resume);
    state.ptyId = channel.ptyId;
  });

  return { ptyId: state.ptyId, ready, cwd: () => state.dir, notice: () => state.notice, cleaned: () => state.cleaned };
}

/**
 * Attach an already-created placeholder harness tab to a new remote channel and hand the channel's
 * `ready` promise to the same provisioning wiring a local `-w` clone uses — so the placeholder →
 * running and placeholder → `provisionError` → auto-close paths are reached through one route
 * regardless of which machine the clone lands on. `onReady` receives the remote workspace's path
 * and the remote's own isolation notice; a leftover the remote removed first is announced here,
 * before it. Failures go through `failHarnessSpawn`.
 */
export function startRemoteTab(
  managers: Managers, options: SpawnTabOptions, remote: RemoteAddress,
  onReady: (cwd: string, notice?: string) => void,
): void {
  const { label, cwd } = options;
  const launch = startRemoteLaunch(managers, label, remote, cwd, options.resume);
  const liveTab = managers.tab.byLabel(label);
  if (liveTab?.harness) liveTab.harness.ptyId = launch.ptyId;
  messageBus.emit('state', { type: 'dirty' });
  wireProvisioning(
    label,
    launch.ready,
    (l) => managers.tab.tabs.some((t) => t.label === l),
    () => {
      reportRemoteCleanup(managers, options.nameRetry, label, remote.host, launch.cleaned());
      onReady(launch.cwd(), launch.notice());
    },
    (message, error) => { failHarnessSpawn(managers, options, message, error); },
  );
}

/**
 * A harness placeholder's workspace — a local `-w` clone or a remote one — failed after the tab was
 * created. A remote label refusal closes it at once (see `failRemoteLaunch`); anything else is
 * surfaced in place of the empty placeholder, and the tab closes shortly after so nothing is left
 * open in a broken state.
 */
export function failHarnessSpawn(managers: Managers, options: SpawnTabOptions, message: string, error: unknown): void {
  const { label } = options;
  failRemoteLaunch(managers, {
    label, kind: 'harness', error, message, retry: options.nameRetry,
    show: (text) => {
      const tab = managers.tab.harnessTab(label);
      if (tab) tab.harness.provisionError = text;
      messageBus.emit('state', { type: 'dirty' });
    },
  });
}
