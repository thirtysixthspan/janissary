import { messageBus } from '../bus.js';
import { startRemoteLaunch } from '../harness/remote-launch.js';
import { makeHarnessTab } from '../tab/index.js';
import { distinctColor } from '../tab/colors.js';
import type { RemoteAddress } from '../remote/address.js';
import type { RemoteResume } from '../remote/resume.js';
import type { Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';

export type RemoteSshBridge = {
  resolved: string;
  creator?: Tab;
  address: RemoteAddress;
  cwd: string;
  resume: RemoteResume;
};

// SSH authentication needs a visible terminal before a restored shell can adopt its remote PTY.
// The bridge owns the connection until the restored tabs retain it, then the attach pass closes it.
export function startSshBridge(managers: Managers, launch: RemoteSshBridge): void {
  const { resolved, creator, address, cwd, resume } = launch;
  const color = distinctColor(managers.tab.tabs.map((tab) => tab.dotColor));
  const harness = { name: 'ssh', program: 'ssh', ptyId: '', status: 'provisioning' as const };
  const tab = makeHarnessTab(
    resolved, color, managers.tab.tabs.length + 1, creator?.group ?? 1, creator?.groupColor ?? color,
    harness,
  );
  tab.remote = { address: address.address, host: address.host };
  managers.tab.insertTabInGroup(tab);
  managers.tab.setCwd(resolved, cwd);
  managers.tab.addBusy(resolved);
  managers.tab.setActiveTab(managers.tab.findIndex(resolved));
  const remote = startRemoteLaunch(managers, resolved, address, cwd, resume);
  harness.ptyId = remote.ptyId;
  messageBus.emit('state', { type: 'dirty' });
  void remote.ready.then(() => {
    const live = managers.tab.harnessTab(resolved);
    if (!live) return;
    managers.tab.setCwd(resolved, remote.cwd());
    managers.tab.deleteBusy(resolved);
    live.harness.status = 'running';
    messageBus.emit('state', { type: 'dirty' });
  }, () => {});
}
