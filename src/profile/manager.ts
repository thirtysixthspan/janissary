import { makeTab, distinctColor } from '../tab/index.js';
import { parseProfileCommand, loadProfile, listProfiles, profileExists } from '../profiles.js';
import { resolveAgentName } from '../commands.js';
import { openProfileEntries } from './agent-opener.js';
import { reportValidation } from './validate.js';
import { saveProfile, formatSaveSummary } from './save.js';
import { notify } from '../notifications.js';
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
    if (loaded.entries.length === 0) {
      out(`Profile "${parsed.name}" has no agents.`);
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
