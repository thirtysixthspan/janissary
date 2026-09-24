import { parseAgentCommand } from '../agent/commands.js';
import type { AgentCommand } from '../agent/types.js';
import { resolveLocalLaunchName } from '../launch-name/local.js';
import { poolCandidates } from '../launch-name/check.js';
import { sandboxNotice } from '../sandbox/index.js';
import { wireProvisioning, PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace/provision-wire.js';
import { messageBus } from '../bus.js';
import { placeAgent } from './place-agent.js';
import { startRemoteAgent } from './remote-agent.js';
import type { Tab } from '../tab/types.js';
import type { Managers } from '../managers.js';

// One typed `agent …` launch, kept whole so a remote host's refusal of a pool name can run it again
// under the next one.
type AgentLaunch = { parsed: AgentCommand; creator: Tab; out: (text: string) => void };

// ProfileManager.newAgent, extracted whole: resolves the agent's name through the launch-name check
// (a typed name is refused on a clash, a pool name moves to the next free one, and either refusal
// goes to the notifications feed), then places the tab immediately (no `--workspace`), hands it to
// the remote launch path (`on <address>`), or places it busy and wires up the clone's ready/fail
// callbacks. `placeAgent` is shared with `newAgentAt`.
export function newAgentOp(managers: Managers, command: string): void {
  const parsed = parseAgentCommand(command);
  const creator = managers.tab.cur();
  const out = (text: string) => managers.tab.append(creator.label, { input: command, output: text });
  if (parsed.remoteError) { out(parsed.remoteError); return; }
  launchAgent(managers, { parsed, creator, out }, []);
}

// `tried` is every label a remote host has already reported running during this launch, passed
// over by the name check; empty on the first attempt.
function launchAgent(managers: Managers, launch: AgentLaunch, tried: readonly string[]): void {
  const { parsed, creator, out } = launch;
  const explicit = parsed.name !== '';
  const resolved = resolveLocalLaunchName(managers, {
    creator: creator.label, name: parsed.name, explicit,
    workspace: parsed.workspace && !parsed.remote, skip: tried,
    ...(!explicit && { candidates: poolCandidates() }),
  });
  if (resolved === undefined) return;

  if (parsed.remote) {
    const cwd = managers.tab.cwdOf(creator.label) ?? process.cwd();
    startRemoteAgent(managers, {
      resolved, creator, address: parsed.remote, offline: parsed.offline, cwd, out,
      nameRetry: {
        creator: creator.label, explicit, tried: [...tried, resolved],
        relaunch: (next) => { launchAgent(managers, launch, next); },
      },
    });
    return;
  }

  if (!parsed.workspace) {
    placeAgent(managers, { resolved, creator, cwd: process.cwd(), offline: parsed.offline });
    out(`Agent "${resolved}" ready.`);
    return;
  }
  startWorkspaceAgent(managers, launch, resolved);
}

function startWorkspaceAgent(managers: Managers, launch: AgentLaunch, resolved: string): void {
  const { parsed, creator, out } = launch;
  const result = managers.workspace.create(resolved);
  if ('error' in result) { out(result.error); return; }
  // The tab is created immediately, busy, with the clone's target directory already known — the
  // "ready" message and sandbox notice fire once the clone actually resolves, not before, so the
  // tab isn't announced ready while it's still empty.
  placeAgent(managers, {
    resolved, creator, cwd: result.dir, workspaceDir: result.dir, offline: parsed.offline, busy: true,
  });
  wireProvisioning(
    resolved,
    result.ready,
    (label) => managers.tab.tabs.some((t) => t.label === label),
    () => {
      managers.tab.deleteBusy(resolved);
      messageBus.emit('state', { type: 'dirty' });
      const notice = sandboxNotice();
      out(`Agent "${resolved}" ready. (workspace: ${managers.tab.shorten(result.dir)})`);
      if (notice) out(notice);
    },
    (message) => {
      out(`Failed to create workspace for "${resolved}": ${message}`);
      setTimeout(() => {
        const index = managers.tab.findIndex(resolved);
        if (index !== -1) managers.tab.closeTab(index);
      }, PROVISION_FAILURE_CLOSE_DELAY_MS);
    },
  );
}
