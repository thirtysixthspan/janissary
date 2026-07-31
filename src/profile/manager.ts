import { makeTab, distinctColor } from '../tab/index.js';
import { listProfiles, profileExists } from '../profiles.js';
import { parseProfileCommand } from './command.js';
import { loadProfile } from './file.js';
import { resolveAgentName } from '../agent/commands.js';
import { openProfileEntries } from './agent-opener.js';
import { reportValidation } from './validate.js';
import { saveProfile, formatSaveSummary } from './save.js';
import { notify } from '../notifications.js';
import { sandboxNotice } from '../sandbox/index.js';
import { wireProvisioning, PROVISION_FAILURE_CLOSE_DELAY_MS } from '../workspace/provision-wire.js';
import { messageBus } from '../bus.js';
import type { Tab } from '../types.js';
import type { Managers } from '../managers.js';
import { newAgentOp } from './new-agent.js';

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
    if (parsed.action === 'save') {
      void saveProfile(parsed.name, this.managers).then((summary) => out(formatSaveSummary(parsed.name, summary)));
      return;
    }
    if (parsed.action === 'validate') {
      out(reportValidation(parsed.name));
      return;
    }
    if (!profileExists(parsed.name)) {
      out(`No profile named "${parsed.name}".`);
      return;
    }
    const loaded = loadProfile(parsed.name);
    if ('error' in loaded) {
      out(`Profile "${parsed.name}" is malformed. Run \`profile validate ${parsed.name}\` for details.`);
      return;
    }
    const tabCount = loaded.entries.length + loaded.editors.length + loaded.views.length
      + loaded.files.length + loaded.notifications.length + loaded.schedules.length;
    if (tabCount === 0) {
      out(`Profile "${parsed.name}" has no tabs.`);
      return;
    }

    openProfileEntries(loaded, this.managers, parsed.name, label, out);
  }

  newAgent(command: string): void {
    newAgentOp(
      this.managers, command,
      (resolved, creator, cwd, workspaceDir, offline, busy) => this.placeAgent(resolved, creator, cwd, workspaceDir, offline, busy),
    );
  }

  // Launch a bare, auto-named agent tab rooted at the named source tab's cwd, joining its group —
  // the ➕ metadata-row button. A no-op for an unknown label; every message (pool exhaustion, a
  // workspace-clone error or its ready confirmation) reaches the notifications feed rather than a
  // transcript, since the source tab may be a harness with no transcript to print into.
  newAgentAt(label: string): void {
    const creator = this.managers.tab.tabs.find((t) => t.label === label);
    if (!creator) return;
    const resolved = resolveAgentName('agent', this.managers.tab.allLabels());
    if (resolved === null) { notify(this.managers, 'manual', label, 'All agent names are in use.'); return; }
    const cwd = this.managers.tab.cwdOf(label) ?? process.cwd();

    if (creator.workspaceDir === undefined) {
      this.placeAgent(resolved, creator, cwd, undefined, false);
      return;
    }

    // Creator tab is workspaced — the new agent inherits its own cloned workspace, following the
    // same clone/busy/provisioning flow as `agent --workspace` (see `newAgentOp`).
    const result = this.managers.workspace.create(resolved);
    if ('error' in result) { notify(this.managers, 'manual', label, result.error); return; }
    this.placeAgent(resolved, creator, result.dir, result.dir, false, true);
    wireProvisioning(
      resolved,
      result.ready,
      (l) => this.managers.tab.tabs.some((t) => t.label === l),
      () => {
        this.managers.tab.deleteBusy(resolved);
        messageBus.emit('state', { type: 'dirty' });
        const notice = sandboxNotice();
        notify(this.managers, 'manual', label, `Agent "${resolved}" ready. (workspace: ${this.managers.tab.shorten(result.dir)})`);
        if (notice) notify(this.managers, 'manual', label, notice);
      },
      (message) => {
        notify(this.managers, 'manual', label, `Failed to create workspace for "${resolved}": ${message}`);
        setTimeout(() => {
          const index = this.managers.tab.findIndex(resolved);
          if (index !== -1) this.managers.tab.closeTab(index);
        }, PROVISION_FAILURE_CLOSE_DELAY_MS);
      },
    );
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
