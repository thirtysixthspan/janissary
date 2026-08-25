import { parseAgentCommand, resolveAgentName } from '../agent/commands.js';
import { sandboxNotice } from '../sandbox/index.js';
import { wireProvisioning, PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace/provision-wire.js';
import { messageBus } from '../bus.js';
import { placeAgent } from './place-agent.js';
import { startRemoteAgent } from './remote-agent.js';
import type { Managers } from '../managers.js';

// ProfileManager.newAgent, extracted whole: resolves a unique agent name, then places the tab
// immediately (no `--workspace`), hands it to the remote launch path (`on <address>`), or places it
// busy and wires up the clone's ready/fail callbacks. `placeAgent` is shared with `newAgentAt`.
export function newAgentOp(managers: Managers, command: string): void {
  const parsed = parseAgentCommand(command);
  const existing = managers.tab.allLabels();
  const creator = managers.tab.cur();
  const resolved = parsed.name || resolveAgentName(`agent ${parsed.name}`, existing);
  const out = (text: string) => managers.tab.append(creator.label, { input: command, output: text });
  if (parsed.remoteError) { out(parsed.remoteError); return; }
  if (resolved === null) { out('All agent names are in use.'); return; }
  if (existing.some((l) => l.toLowerCase() === resolved.toLowerCase())) { out(`Agent "${resolved}" is already active.`); return; }

  if (parsed.remote) {
    const cwd = managers.tab.cwdOf(creator.label) ?? process.cwd();
    startRemoteAgent(managers, { resolved, creator, address: parsed.remote, offline: parsed.offline, cwd, out });
    return;
  }

  if (!parsed.workspace) {
    placeAgent(managers, { resolved, creator, cwd: process.cwd(), offline: parsed.offline });
    out(`Agent "${resolved}" ready.`);
    return;
  }

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
