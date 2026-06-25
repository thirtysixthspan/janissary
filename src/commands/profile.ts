import type { Command } from './types.js';
import type { Tab } from '../types.js';
import { distinctColor, makeTab } from '../tab.js';
import { saveAgentState } from '../agent-state.js';
import { parseProfileCommand, loadProfileAgents, listProfiles, profileExists } from '../profiles.js';

export const command: Command = {
  name: 'profile',
  match: (command_) => /^profile\b/i.test(command_),
  handler: (command_, context) => {
    const { updateCurrentTab, tabs, setTabs, setActiveTab, cwdRef, initAgentState } = context;
    const out = (text: string) =>
      updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: command_, output: text }], scrollOffset: 0 }));
    const parsed = parseProfileCommand(command_);

    if ('error' in parsed) {
      out(parsed.error);
      return;
    }

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

    // A launched profile forms one group, shared by all its agents (same group bar color). Honor
    // a group authored on the profile's agent files; otherwise mint the next free group number.
    const existingMax = Math.max(0, ...tabs.map((t) => t.group ?? 1));
    const authored = agents.map((a) => a.group).find((g): g is number => typeof g === 'number');
    const profileGroup = authored ?? existingMax + 1;

    // Open a tab per agent, restoring each from its profile state. Seed the live state dir
    // first so `initAgentState` (which loads from there) picks up the profile's data.
    const open = new Set(tabs.map((t) => t.label.toLowerCase()));
    // Colors already on screen (or assigned earlier in this launch) so the new group's agents
    // don't reuse them. The group's bar color is the first launched agent's color.
    const usedColors = new Set(tabs.map((t) => t.dotColor));
    const newTabs: Tab[] = [];
    const opened: string[] = [];
    const skipped: string[] = [];
    let index = tabs.length;
    // The group's bar color is fixed to the first launched agent's color.
    let groupColor: string | undefined;
    for (const state of agents) {
      if (open.has(state.name.toLowerCase())) {
        skipped.push(state.name);
        continue;
      }
      // Keep the profile's color only when it is substantially different from every color
      // already on screen; otherwise pick the most distinct palette color.
      const dotColor = distinctColor(usedColors, state.dotColor);
      usedColors.add(dotColor);
      groupColor ??= dotColor;
      try { saveAgentState({ ...state, dotColor, group: profileGroup, groupColor }); } catch { /* ignore */ }
      const init = initAgentState(state.name, dotColor, profileGroup, groupColor);
      const { cmdHistory, log, cwd, workspaceDir } = init;
      newTabs.push(makeTab(state.name, dotColor, index + 1, cmdHistory ?? [], log ?? [], workspaceDir, profileGroup, groupColor));
      if (cwd) cwdRef.current[state.name] = cwd;
      open.add(state.name.toLowerCase());
      opened.push(state.name);
      index++;
    }

    if (newTabs.length > 0) {
      const firstNew = tabs.length;
      setTabs((previous) => [...previous, ...newTabs]);
      setActiveTab(firstNew);
    }

    const parts: string[] = [];
    if (opened.length > 0) parts.push(`Launched profile "${parsed.name}": ${opened.join(', ')}.`);
    if (skipped.length > 0) parts.push(`Already open: ${skipped.join(', ')}.`);
    if (parts.length === 0) parts.push(`Profile "${parsed.name}" has no agents to open.`);
    out(parts.join(' '));
  },
};
