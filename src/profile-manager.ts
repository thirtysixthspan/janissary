import { makeTab, distinctColor } from './tab.js';
import { parseProfileCommand, loadProfileAgents, listProfiles, profileExists } from './profiles.js';
import { parseAgentCommand, resolveAgentName } from './commands.js';
import { openProfileAgents } from './profile-agent-opener.js';
import type { Managers } from './managers.js';

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
    const agents = loadProfileAgents(parsed.name);
    if (agents.length === 0) {
      out(`Profile "${parsed.name}" has no agents.`);
      return;
    }

    openProfileAgents(agents, this.managers, parsed.name, out);
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

    const dotColor = distinctColor(this.managers.tab.tabs.map((t) => t.dotColor));
    const group = creator?.group ?? 1;
    const groupColor = creator?.groupColor ?? dotColor;
    const tab = makeTab(resolved, dotColor, this.managers.tab.tabs.length + 1, [], [], workspaceDir, group, groupColor);
    tab.toolStepsExpanded = false;
    this.managers.tab.insertTabInGroup(tab);
    this.managers.tab.setCwd(resolved, workspaceDir ?? process.cwd());
    this.managers.tab.setActiveTab(this.managers.tab.findIndex(creator.label));
    this.managers.tab.persist(this.managers.tab.buildAgentState(tab));
    out(`Agent "${resolved}" ready.${workspaceDir ? ` (workspace: ${this.managers.tab.shorten(workspaceDir)})` : ''}`);
  }
}
