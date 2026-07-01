import { makeTab, distinctColor } from './tab.js';
import { parseProfileCommand, loadProfileAgents, listProfiles, profileExists } from './profiles.js';
import { parseAgentCommand, resolveAgentName } from './commands.js';
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

    const authored = agents.map((a) => a.group).find((g): g is number => typeof g === 'number');
    const group = authored ?? Math.max(0, ...this.managers.tab.tabs.map((t) => t.group)) + 1;
    const open = new Set(this.managers.tab.tabs.map((t) => t.label.toLowerCase()));
    const used = new Set(this.managers.tab.tabs.map((t) => t.dotColor));
    const opened: string[] = [];
    const skipped: string[] = [];
    let groupColor: string | undefined;
    const firstNew = this.managers.tab.tabs.length;

    for (const state of agents) {
      if (open.has(state.name.toLowerCase())) { skipped.push(state.name); continue; }
      const dotColor = distinctColor(used, state.dotColor);
      used.add(dotColor);
      groupColor ??= dotColor;
      const log = state.log ?? [];
      const tab = makeTab(state.name, dotColor, this.managers.tab.tabs.length + 1, state.cmdHistory ?? [],
        log, state.workspaceDir, group, groupColor);
      tab.toolStepsExpanded = false;
      this.managers.tab.tabs = [...this.managers.tab.tabs, tab];
      if (state.cwd) this.managers.tab.setCwd(state.name, state.cwd);
      if (state.context) this.managers.tab.setContext(state.name, state.context);
      if (state.schedule) this.managers.schedule.set(state.name, state.schedule);
      this.managers.tab.persist(this.managers.tab.buildAgentState(tab, { schedule: state.schedule }));
      open.add(state.name.toLowerCase());
      opened.push(state.name);
    }

    if (opened.length > 0) this.managers.tab.setActiveTab(firstNew);
    const parts: string[] = [];
    if (opened.length > 0) parts.push(`Launched profile "${parsed.name}": ${opened.join(', ')}.`);
    if (skipped.length > 0) parts.push(`Already open: ${skipped.join(', ')}.`);
    out(parts.length > 0 ? parts.join(' ') : `Profile "${parsed.name}" has no agents to open.`);
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
