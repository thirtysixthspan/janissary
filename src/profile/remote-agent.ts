import { messageBus } from '../bus.js';
import { startRemoteLaunch } from '../harness/remote-launch.js';
import { wireProvisioning } from '../workspace/provision-wire.js';
import { failRemoteLaunch, reportRemoteCleanup, reportRemoteClone, type RemoteNameRetry } from '../launch-name/fail-remote.js';
import { placeAgent, type PlaceAgentOptions } from './place-agent.js';
import type { RemoteAddress } from '../remote/address.js';
import type { RemoteResume } from '../remote/resume.js';
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
  // Set when this launch is really an attach: the channel asks to attach rather than to
  // provision, and the workspace it comes back to is the one the record remembers.
  resume?: RemoteResume;
  // Set for a fresh launch, so a host's label refusal is reported to the right tab or, for a pool
  // name, retried under the next one (see `failRemoteLaunch`). Never set for an attach.
  nameRetry?: RemoteNameRetry;
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
  const remote = startRemoteLaunch(managers, resolved, address, cwd, launch.resume);
  setActivePty(managers, resolved, remote.ptyId);
  messageBus.emit('state', { type: 'dirty' });

  wireProvisioning(
    resolved,
    remote.ready,
    (label) => managers.tab.tabs.some((t) => t.label === label),
    () => {
      setActivePty(managers, resolved, undefined);
      managers.tab.setCwd(resolved, remote.cwd());
      managers.shell.ensure(resolved);
      managers.tab.deleteBusy(resolved);
      messageBus.emit('state', { type: 'dirty' });
      reportRemoteCleanup(managers, launch.nameRetry, resolved, address.host, remote.cleaned());
      reportRemoteClone(managers, launch.nameRetry, address.host, remote.cloned());
      out(`Agent "${resolved}" ready on ${address.host}. (workspace: ${remote.cwd()})`);
      const notice = remote.notice();
      if (notice) out(notice);
    },
    (message, error) => {
      failRemoteLaunch(managers, {
        label: resolved, kind: 'agent', error, message, retry: launch.nameRetry,
        show: (text) => { out(`Failed to start "${resolved}" on ${address.host}: ${text}`); },
      });
    },
  );
}

function setActivePty(managers: Managers, label: string, id: string | undefined): void {
  const tab = managers.tab.byLabel(label);
  if (tab) tab.activePty = id;
}
