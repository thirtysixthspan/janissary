import type { Command } from './types.js';
import { distinctColor, makeTab, insertTabInGroup } from '../tab.js';
import { resolveAgentName, parseAgentCommand } from '../commands.js';
import { findRepoRoot, createWorkspace } from '../workspace.js';
import { saveAgentState } from '../agent-state.js';

export const command: Command = {
  name: 'agent',
  match: (command_) => /^agent\b/i.test(command_),
  handler: (command_, context) => {
    const { updateCurrentTab, tabs, activeTab, setTabs, cwdRef, workspaceRef, setAgentStates, initAgentState } = context;
    const existingLabels = tabs.map((t) => t.label);
    // A newly created agent joins the group of the agent that created it (the tab the `agent`
    // command ran in), inheriting that group's number and its fixed bar color.
    const creator = tabs[activeTab];
    const creatorGroup = creator?.group ?? 1;
    const parsed = parseAgentCommand(command_);
    const resolved = parsed.name || resolveAgentName(`agent ${parsed.name}`, existingLabels);
    if (resolved === null) {
      updateCurrentTab((tab) => (
        { ...tab, log: [...tab.log, { input: command_, output: 'All agent names are in use.' }], scrollOffset: 0 }
      ));
      return;
    }
    if (existingLabels.some((l) => l.toLowerCase() === resolved.toLowerCase())) {
      updateCurrentTab((tab) => (
        { ...tab, log: [...tab.log, { input: command_, output: `Agent "${resolved}" is already active.` }], scrollOffset: 0 }
      ));
      return;
    }
    let workspaceDirectory: string | undefined;
    if (parsed.workspace) {
      const repoRoot = findRepoRoot(process.cwd());
      if (!repoRoot) {
        updateCurrentTab((tab) => (
          { ...tab, log: [...tab.log, { input: command_, output: 'No git repository found. Cannot create workspace.' }], scrollOffset: 0 }
        ));
        return;
      }
      try {
        workspaceDirectory = createWorkspace(resolved, repoRoot);
      } catch (error) {
        updateCurrentTab((tab) => (
          { ...tab, log: [...tab.log, { input: command_, output: `Failed to create workspace: ${error instanceof Error ? error.message : String(error)}` }], scrollOffset: 0 }
        ));
        return;
      }
    }
    // Pick a color clearly distinct from every tab already on screen.
    const dotColor = distinctColor(tabs.map((t) => t.dotColor));
    const creatorGroupColor = creator?.groupColor ?? dotColor;
    const { cmdHistory, log, group, groupColor } = initAgentState(resolved, dotColor, creatorGroup, creatorGroupColor);
    // Insert next to the creator's group so the group stays a single connected run.
    setTabs((previous) => insertTabInGroup(previous, makeTab(resolved, dotColor, previous.length + 1, cmdHistory ?? [], log ?? [], workspaceDirectory, group, groupColor)));
    if (workspaceDirectory) {
      cwdRef.current[resolved] = workspaceDirectory;
      workspaceRef.current.add(workspaceDirectory);
      setAgentStates((previous) => {
        const current = previous[resolved];
        if (!current) return previous;
        const updated = { ...current, workspaceDir: workspaceDirectory };
        try { saveAgentState(updated); } catch { /* ignore */ }
        return { ...previous, [resolved]: updated };
      });
    }
    const suffix = workspaceDirectory ? ` (workspace: ${workspaceDirectory})` : '';
    updateCurrentTab((tab) => (
      { ...tab, log: [...tab.log, { input: command_, output: `Agent "${resolved}" ready.${suffix}` }], scrollOffset: 0 }
    ));
  },
};
