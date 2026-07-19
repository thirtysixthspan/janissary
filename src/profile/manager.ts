import { makeTab, distinctColor } from '../tab/index.js';
import { parseProfileCommand, loadProfileEntries, listProfiles, profileExists } from '../profiles.js';
import { parseAgentCommand, resolveAgentName } from '../commands.js';
import { openProfileEntries } from './agent-opener.js';
import { sandboxNotice } from '../sandbox/index.js';
import { notify } from '../notifications.js';
import { wireProvisioning, PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace-provision-wire.js';
import { messageBus } from '../bus.js';
import type { Tab } from '../types.js';
import type { Managers } from '../managers.js';

export class ProfileManager {
  constructor(private managers: Managers) {}

  run(command: string, label: string): void {
    const parsed = parseProfileCommand(command);
    const out = (text: string) => this.managers.tab.append(label, { input: command, output: text });
    if ('error' in parsed) { out(parsed.error); return; }
    if (parsed.action === 'list') {
      const names = listProfiles();
      out(names.length > 0 ? names.join('\n') : 'No profiles.');
      return;
    }
    if (!profileExists(parsed.name)) {
      out(`No profile named "${parsed.name}".`);
      return;
    }
    const entries = loadProfileEntries(parsed.name);
    if (entries.length === 0) {
      out(`Profile "${parsed.name}" has no agents.`);
      return;
    }

    openProfileEntries(entries, this.managers, parsed.name, label, out);
  }

  newAgent(command: string): void {
    const parsed = parseAgentCommand(command);
    const existing = this.managers.tab.allLabels();
    const creator = this.managers.tab.cur();
    const resolved = parsed.name || resolveAgentName(`agent ${parsed.name}`, existing);
    const out = (text: string) => this.managers.tab.append(creator.label, { input: command, output: text });
    if (resolved === null) { out('All agent names are in use.'); return; }
    if (existing.some((l) => l.toLowerCase() === resolved.toLowerCase())) { out(`Agent "${resolved}" is already active.`); return; }

    if (!parsed.workspace) {
      this.placeAgent(resolved, creator, process.cwd(), undefined, parsed.offline);
      out(`Agent "${resolved}" ready.`);
      return;
    }

    const result = this.managers.workspace.create(resolved);
    if ('error' in result) { out(result.error); return; }
    // The tab is created immediately, busy, with the clone's target directory already known — the
    // "ready" message and sandbox notice fire once the clone actually resolves, not before, so the
    // tab isn't announced ready while it's still empty.
    this.placeAgent(resolved, creator, result.dir, result.dir, parsed.offline, true);
    wireProvisioning(
      resolved,
      result.ready,
      (label) => this.managers.tab.tabs.some((t) => t.label === label),
      () => {
        this.managers.tab.deleteBusy(resolved);
        messageBus.emit('state', { type: 'dirty' });
        const notice = sandboxNotice();
        out(`Agent "${resolved}" ready. (workspace: ${this.managers.tab.shorten(result.dir)})`);
        if (notice) out(notice);
      },
      (message) => {
        out(`Failed to create workspace for "${resolved}": ${message}`);
        setTimeout(() => {
          const index = this.managers.tab.findIndex(resolved);
          if (index !== -1) this.managers.tab.closeTab(index);
        }, PROVISION_FAILURE_CLOSE_DELAY_MS);
      },
    );
  }

  // Launch a bare, auto-named agent tab rooted at the named source tab's cwd, joining its group —
  // the ➕ metadata-row button. A no-op for an unknown label; on pool exhaustion the error reaches
  // the notifications feed (the source tab may be a harness with no transcript to print into).
  newAgentAt(label: string): void {
    const creator = this.managers.tab.tabs.find((t) => t.label === label);
    if (!creator) return;
    const resolved = resolveAgentName('agent', this.managers.tab.allLabels());
    if (resolved === null) { notify(this.managers, 'manual', label, 'All agent names are in use.'); return; }
    this.placeAgent(resolved, creator, this.managers.tab.cwdOf(label) ?? process.cwd(), undefined, false);
  }

  // Build the agent tab, insert it into its creator's group, set its cwd, focus it, and persist —
  // the creation body shared by `newAgent` (active tab as creator) and `newAgentAt` (a label-resolved
  // source tab that may be docked and not active). `busy`, when true, marks the tab busy on creation
  // (a `--workspace` launch still waiting on its clone) — everything typed in the meantime queues
  // through the ordinary busy-tab command queue.
  private placeAgent(resolved: string, creator: Tab | undefined, cwd: string, workspaceDir: string | undefined, offline: boolean, busy = false): void {
    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    const tab = makeTab(resolved, dotColor, this.managers.tab.tabs.length + 1, [], [], workspaceDir, group, groupColor);
    tab.toolStepsExpanded = false;
    tab.offline = offline;
    this.managers.tab.insertTabInGroup(tab);
    this.managers.tab.setCwd(resolved, cwd);
    if (busy) this.managers.tab.addBusy(resolved);
    this.managers.tab.setActiveTab(this.managers.tab.findIndex(resolved));
    this.managers.tab.persist(this.managers.tab.buildAgentState(tab));
  }
}
