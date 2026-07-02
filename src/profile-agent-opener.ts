import { distinctColor, makeTab } from './tab.js';
import type { Managers } from './managers.js';
import type { AgentState } from './types.js';

export function openProfileAgents(
  agents: AgentState[],
  managers: Managers,
  name: string,
  out: (text: string) => void,
): void {
  const authored = agents.map((a) => a.group).find((g): g is number => typeof g === 'number');
  const group = authored ?? Math.max(0, ...managers.tab.tabs.map((t) => t.group)) + 1;
  const open = new Set(managers.tab.tabs.map((t) => t.label.toLowerCase()));
  const used = new Set(managers.tab.tabs.map((t) => t.dotColor));
  const opened: string[] = [];
  const skipped: string[] = [];
  let groupColor: string | undefined;
  const firstNew = managers.tab.tabs.length;

  for (const state of agents) {
    if (open.has(state.name.toLowerCase())) { skipped.push(state.name); continue; }
    const dotColor = distinctColor(used, state.dotColor);
    used.add(dotColor);
    groupColor ??= dotColor;
    const log = state.log ?? [];
    const tab = makeTab(state.name, dotColor, managers.tab.tabs.length + 1, state.cmdHistory ?? [],
      log, state.workspaceDir, group, groupColor);
    tab.toolStepsExpanded = false;
    managers.tab.tabs = [...managers.tab.tabs, tab];
    if (state.cwd) managers.tab.setCwd(state.name, state.cwd);
    if (state.context) managers.tab.setContext(state.name, state.context);
    if (state.schedule) managers.schedule.set(state.name, state.schedule);
    managers.tab.persist(managers.tab.buildAgentState(tab, { schedule: state.schedule }));
    open.add(state.name.toLowerCase());
    opened.push(state.name);
  }

  if (opened.length > 0) managers.tab.setActiveTab(firstNew);
  const parts: string[] = [];
  if (opened.length > 0) parts.push(`Launched profile "${name}": ${opened.join(', ')}.`);
  if (skipped.length > 0) parts.push(`Already open: ${skipped.join(', ')}.`);
  out(parts.length > 0 ? parts.join(' ') : `Profile "${name}" has no agents to open.`);
}
