import { makeTab, distinctColor } from '../tab/index.js';
import { parseProfileCommand, loadProfileEntries, listProfiles, profileExists } from '../profiles.js';
import { parseAgentCommand, resolveAgentName } from '../commands.js';
import { openProfileEntries } from './agent-opener.js';
import { sandboxNotice } from '../sandbox/index.js';
import { notify } from '../notifications.js';
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

    let workspaceDir: string | undefined;
    if (parsed.workspace) {
      const result = this.managers.workspace.create(resolved);
      if ('error' in result) { out(result.error); return; }
      workspaceDir = result.dir;
    }

    this.placeAgent(resolved, creator, workspaceDir ?? process.cwd(), workspaceDir, parsed.offline);
    const notice = workspaceDir ? sandboxNotice() : undefined;
    out(`Agent "${resolved}" ready.${workspaceDir ? ` (workspace: ${this.managers.tab.shorten(workspaceDir)})` : ''}`);
    if (notice) out(notice);
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
  // source tab that may be docked and not active).
  private placeAgent(resolved: string, creator: Tab | undefined, cwd: string, workspaceDir: string | undefined, offline: boolean): void {
    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    const tab = makeTab(resolved, dotColor, this.managers.tab.tabs.length + 1, [], [], workspaceDir, group, groupColor);
    tab.toolStepsExpanded = false;
    tab.offline = offline;
    this.managers.tab.insertTabInGroup(tab);
    this.managers.tab.setCwd(resolved, cwd);
    this.managers.tab.setActiveTab(this.managers.tab.findIndex(resolved));
    this.managers.tab.persist(this.managers.tab.buildAgentState(tab));
  }
}
