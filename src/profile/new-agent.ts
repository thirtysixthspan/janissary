import { parseAgentCommand, resolveAgentName } from '../commands.js';
import { sandboxNotice } from '../sandbox/index.js';
import { wireProvisioning, PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace-provision-wire.js';
import { messageBus } from '../bus.js';
import type { Tab } from '../types.js';
import type { Managers } from '../managers.js';

// ProfileManager.newAgent, extracted whole: resolves a unique agent name, then either places the
// tab immediately (no `--workspace`) or places it busy and wires up the clone's ready/fail
// callbacks. `placeAgent` stays the caller's — it's shared with `newAgentAt`.
export function newAgentOp(
  managers: Managers, command: string,
  placeAgent: (resolved: string, creator: Tab | undefined, cwd: string, workspaceDir: string | undefined, offline: boolean, busy?: boolean) => void,
): void {
  const parsed = parseAgentCommand(command);
  const existing = managers.tab.allLabels();
  const creator = managers.tab.cur();
  const resolved = parsed.name || resolveAgentName(`agent ${parsed.name}`, existing);
  const out = (text: string) => managers.tab.append(creator.label, { input: command, output: text });
  if (resolved === null) { out('All agent names are in use.'); return; }
  if (existing.some((l) => l.toLowerCase() === resolved.toLowerCase())) { out(`Agent "${resolved}" is already active.`); return; }

  if (!parsed.workspace) {
    placeAgent(resolved, creator, process.cwd(), undefined, parsed.offline);
    out(`Agent "${resolved}" ready.`);
    return;
  }

  const result = managers.workspace.create(resolved);
  if ('error' in result) { out(result.error); return; }
  // The tab is created immediately, busy, with the clone's target directory already known — the
  // "ready" message and sandbox notice fire once the clone actually resolves, not before, so the
  // tab isn't announced ready while it's still empty.
  placeAgent(resolved, creator, result.dir, result.dir, parsed.offline, true);
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
