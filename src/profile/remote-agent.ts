import { messageBus } from '../bus.js';
import { startRemoteLaunch } from '../harness/remote-launch.js';
import { wireProvisioning, PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace/provision-wire.js';
import { placeAgent, type PlaceAgentOptions } from './place-agent.js';
import type { RemoteAddress } from '../remote/address.js';
import type { Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';

// What a remote agent launch is created from. `out` receives the ready confirmation, the remote's
// isolation notice, and any failure — a transcript line for a typed `agent … on <host>`, the
// notifications feed for a profile launch, whose summary has already been printed by the time a
// channel finishes authenticating.
export type RemoteAgentLaunch = {
  resolved: string;
  creator?: Tab;
  address: RemoteAddress;
  offline: boolean;
  cwd: string;
  presentation?: PlaceAgentOptions['presentation'];
  out: (text: string) => void;
};

/**
 * `agent <name> on <address>`: an agent tab whose persistent shell runs on another host. The tab is
 * an ordinary agent tab — same transcript, same command bar, same busy queue — with one difference
 * while it starts up: the ssh session takes the tab over full-screen through the existing
 * `activePty` mechanism, so ssh's own password, passphrase, and host-key prompts render there and
 * are answered by typing. Once the remote workspace is ready the takeover is released and the
 * transcript comes back.
 */
export function startRemoteAgent(managers: Managers, launch: RemoteAgentLaunch): void {
  const { resolved, creator, address, offline, cwd, presentation, out } = launch;
  placeAgent(managers, {
    resolved, creator, cwd, offline, busy: true, presentation,
    remote: { address: address.address, host: address.host },
  });
  const remote = startRemoteLaunch(managers, resolved, address, cwd);
  setActivePty(managers, resolved, remote.ptyId);
  messageBus.emit('state', { type: 'dirty' });

  wireProvisioning(
    resolved,
    remote.ready,
    (label) => managers.tab.tabs.some((t) => t.label === label),
    () => {
      setActivePty(managers, resolved, undefined);
      managers.tab.setCwd(resolved, remote.cwd());
      managers.tab.deleteBusy(resolved);
      messageBus.emit('state', { type: 'dirty' });
      out(`Agent "${resolved}" ready on ${address.host}. (workspace: ${remote.cwd()})`);
      const notice = remote.notice();
      if (notice) out(notice);
    },
    (message) => {
      out(`Failed to start "${resolved}" on ${address.host}: ${message}`);
      setTimeout(() => {
        const index = managers.tab.findIndex(resolved);
        if (index !== -1) managers.tab.closeTab(index);
      }, PROVISION_FAILURE_CLOSE_DELAY_MS);
    },
  );
}

function setActivePty(managers: Managers, label: string, id: string | undefined): void {
  const tab = managers.tab.tabs.find((t) => t.label === label);
  if (tab) tab.activePty = id;
}
