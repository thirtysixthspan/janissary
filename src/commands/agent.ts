import type { Command } from './types.js';
import { distinctColor, makeTab, insertTabInGroup } from '../tab.js';
import { resolveAgentName, parseAgentCommand } from '../commands.js';
import { findRepoRoot, createWorkspace } from '../server/workspace.js';
import { saveAgentState } from '../agent-state.js';

export const command: Command = {
  name: 'agent',
  match: (cmd) => /^agent\b/i.test(cmd),
  handler: (cmd, ctx) => {
    const { updateCurrentTab, tabs, activeTab, setTabs, cwdRef, workspaceRef, setAgentStates, initAgentState } = ctx;
    const existingLabels = tabs.map((t) => t.label);
    // A newly created agent joins the group of the agent that created it (the tab the `agent`
    // command ran in), inheriting that group's number and its fixed bar color.
    const creator = tabs[activeTab];
    const creatorGroup = creator?.group ?? 1;
    const parsed = parseAgentCommand(cmd);
    const resolved = parsed.name || resolveAgentName(`agent ${parsed.name}`, existingLabels);
    if (resolved === null) {
      updateCurrentTab((tab) => (
        { ...tab, log: [...tab.log, { input: cmd, output: 'All agent names are in use.' }], scrollOffset: 0 }
      ));
      return;
    }
    if (existingLabels.some((l) => l.toLowerCase() === resolved.toLowerCase())) {
      updateCurrentTab((tab) => (
        { ...tab, log: [...tab.log, { input: cmd, output: `Agent "${resolved}" is already active.` }], scrollOffset: 0 }
      ));
      return;
    }
    let workspaceDir: string | undefined;
    if (parsed.workspace) {
      const repoRoot = findRepoRoot(process.cwd());
      if (!repoRoot) {
        updateCurrentTab((tab) => (
          { ...tab, log: [...tab.log, { input: cmd, output: 'No git repository found. Cannot create workspace.' }], scrollOffset: 0 }
        ));
        return;
      }
      try {
        workspaceDir = createWorkspace(resolved, repoRoot);
      } catch (e) {
        updateCurrentTab((tab) => (
          { ...tab, log: [...tab.log, { input: cmd, output: `Failed to create workspace: ${e instanceof Error ? e.message : String(e)}` }], scrollOffset: 0 }
        ));
        return;
      }
    }
    // Pick a color clearly distinct from every tab already on screen.
    const dotColor = distinctColor(tabs.map((t) => t.dotColor));
    const creatorGroupColor = creator?.groupColor ?? dotColor;
    const { cmdHistory, log, group, groupColor } = initAgentState(resolved, dotColor, creatorGroup, creatorGroupColor);
    // Insert next to the creator's group so the group stays a single connected run.
    setTabs((prev) => insertTabInGroup(prev, makeTab(resolved, dotColor, prev.length + 1, cmdHistory ?? [], log ?? [], workspaceDir, group, groupColor)));
    if (workspaceDir) {
      cwdRef.current[resolved] = workspaceDir;
      workspaceRef.current.add(workspaceDir);
      setAgentStates((prev) => {
        const cur = prev[resolved];
        if (!cur) return prev;
        const updated = { ...cur, workspaceDir };
        try { saveAgentState(updated); } catch { /* ignore */ }
        return { ...prev, [resolved]: updated };
      });
    }
    const suffix = workspaceDir ? ` (workspace: ${workspaceDir})` : '';
    updateCurrentTab((tab) => (
      { ...tab, log: [...tab.log, { input: cmd, output: `Agent "${resolved}" ready.${suffix}` }], scrollOffset: 0 }
    ));
  },
};
