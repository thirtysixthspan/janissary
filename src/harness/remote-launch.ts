import { messageBus } from '../bus.js';
import { wireProvisioning } from '../workspace/provision-wire.js';
import type { Managers } from '../managers.js';
import type { RemoteAddress } from '../remote/address.js';
import type { SpawnTabOptions } from './spawn-options.js';

// The "open a channel, insert the placeholder, resolve `ready` from frames" sequence, kept out of
// `HarnessManager` — which was already split once for size (see `command-parse.ts`) — and shared by
// the harness and agent launch paths, since both need exactly this and differ only in what they do
// once the workspace is ready.

// A remote launch in flight. `ready` is the same `Promise<void>` a local `-w` clone hands
// `wireProvisioning`, so the placeholder-tab machinery is reached through one path regardless of
// which machine the clone lands on. `cwd` and `notice` are only meaningful once it resolves: the
// remote workspace's path, and the remote's own sandbox notice (isolation is the remote host's
// decision, so the notice has to come from there rather than be computed locally).
export type RemoteLaunchState = {
  ptyId: string;
  ready: Promise<void>;
  cwd: () => string;
  notice: () => string | undefined;
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
 * rendering in that terminal. A channel that dies afterwards simply closes the tab, the way a
 * harness tab closes when its process exits.
 */
export function startRemoteLaunch(
  managers: Managers, label: string, address: RemoteAddress, cwd: string,
): RemoteLaunchState {
  // The channel is opened inside the executor, which runs synchronously, so `ptyId` is filled in
  // before this function returns and no resolver has to be lifted out of the promise.
  const state = { dir: cwd, notice: undefined as string | undefined, ptyId: '', settled: false };
  const ready = new Promise<void>((resolve, reject) => {
    const channel = managers.remote.open(label, address, cwd, {
      onReady: (remoteDir, remoteNotice) => {
        state.dir = remoteDir;
        state.notice = remoteNotice;
        state.settled = true;
        resolve();
      },
      onFailed: (message) => {
        if (state.settled) { closeTab(managers, label); return; }
        state.settled = true;
        reject(new Error(message));
      },
      onClosed: () => {
        if (state.settled) { closeTab(managers, label); return; }
        state.settled = true;
        reject(new Error(`Remote session to ${address.host} ended before its workspace was ready.`));
      },
    });
    state.ptyId = channel.ptyId;
  });

  return { ptyId: state.ptyId, ready, cwd: () => state.dir, notice: () => state.notice };
}

/**
 * Attach an already-created placeholder harness tab to a new remote channel and hand the channel's
 * `ready` promise to the same provisioning wiring a local `-w` clone uses — so the placeholder →
 * running and placeholder → `provisionError` → auto-close paths are reached through one route
 * regardless of which machine the clone lands on. `onReady` receives the remote workspace's path
 * and the remote's own isolation notice.
 */
export function startRemoteTab(
  managers: Managers, options: SpawnTabOptions, remote: RemoteAddress,
  onReady: (cwd: string, notice?: string) => void,
  onFailed: (message: string) => void,
): void {
  const { label, cwd } = options;
  const launch = startRemoteLaunch(managers, label, remote, cwd);
  const liveTab = managers.tab.tabs.find((t) => t.label === label);
  if (liveTab?.harness) liveTab.harness.ptyId = launch.ptyId;
  messageBus.emit('state', { type: 'dirty' });
  wireProvisioning(
    label,
    launch.ready,
    (l) => managers.tab.tabs.some((t) => t.label === l),
    () => onReady(launch.cwd(), launch.notice()),
    onFailed,
  );
}
