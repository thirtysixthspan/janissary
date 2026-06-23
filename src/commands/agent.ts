import type { Command } from './types.js';
import { dotColors, makeTab } from '../tab.js';
import { resolveAgentName, parseAgentCommand } from '../commands.js';
import { findRepoRoot, createWorkspace } from '../workspace.js';
import { saveAgentState } from '../agent-state.js';

export const command: Command = {
  name: 'agent',
  match: (cmd) => /^agent\b/i.test(cmd),
  handler: (cmd, ctx) => {
    const { updateCurrentTab, tabs, setTabs, cwdRef, workspaceRef, setAgentStates, initAgentState } = ctx;
    const existingLabels = tabs.map((t) => t.label);
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
    const newTabIndex = tabs.length;
    const dotColor = dotColors[newTabIndex % dotColors.length];
    const { cmdHistory, log } = initAgentState(resolved, dotColor);
    setTabs((prev) => [...prev, makeTab(resolved, dotColor, newTabIndex + 1, cmdHistory ?? [], log ?? [], workspaceDir)]);
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
