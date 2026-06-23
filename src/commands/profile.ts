import type { Command } from './types.js';
import type { Tab } from '../types.js';
import { dotColors, makeTab } from '../tab.js';
import { saveAgentState } from '../agent-state.js';
import { parseProfileCommand, loadProfileAgents, listProfiles, profileExists } from '../profiles.js';

export const command: Command = {
  name: 'profile',
  match: (cmd) => /^profile\b/i.test(cmd),
  handler: (cmd, ctx) => {
    const { updateCurrentTab, tabs, setTabs, setActiveTab, cwdRef, initAgentState } = ctx;
    const out = (text: string) =>
      updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: cmd, output: text }], scrollOffset: 0 }));
    const parsed = parseProfileCommand(cmd);

    if ('error' in parsed) {
      out(parsed.error);
      return;
    }

    if (parsed.action === 'list') {
      const names = listProfiles();
      out(names.length ? names.join('\n') : 'No profiles.');
      return;
    }

    if (!profileExists(parsed.name)) {
      out(`No profile named "${parsed.name}".`);
      return;
    }
    const agents = loadProfileAgents(parsed.name);
    if (!agents.length) {
      out(`Profile "${parsed.name}" has no agents.`);
      return;
    }

    // Open a tab per agent, restoring each from its profile state. Seed the live state dir
    // first so `initAgentState` (which loads from there) picks up the profile's data.
    const open = new Set(tabs.map((t) => t.label.toLowerCase()));
    const newTabs: Tab[] = [];
    const opened: string[] = [];
    const skipped: string[] = [];
    let index = tabs.length;
    for (const state of agents) {
      if (open.has(state.name.toLowerCase())) {
        skipped.push(state.name);
        continue;
      }
      try { saveAgentState(state); } catch { /* ignore */ }
      // Use the color the profile specifies; fall back to the position-based color.
      const dotColor = state.dotColor || dotColors[index % dotColors.length];
      const { cmdHistory, log, cwd, workspaceDir } = initAgentState(state.name, dotColor);
      newTabs.push(makeTab(state.name, dotColor, index + 1, cmdHistory ?? [], log ?? [], workspaceDir));
      if (cwd) cwdRef.current[state.name] = cwd;
      open.add(state.name.toLowerCase());
      opened.push(state.name);
      index++;
    }

    if (newTabs.length) {
      const firstNew = tabs.length;
      setTabs((prev) => [...prev, ...newTabs]);
      setActiveTab(firstNew);
    }

    const parts: string[] = [];
    if (opened.length) parts.push(`Launched profile "${parsed.name}": ${opened.join(', ')}.`);
    if (skipped.length) parts.push(`Already open: ${skipped.join(', ')}.`);
    if (!parts.length) parts.push(`Profile "${parsed.name}" has no agents to open.`);
    out(parts.join(' '));
  },
};
