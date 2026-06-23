import { stripComments } from './tab.js';
import { resolveCommand } from './resolve.js';
import { saveAgentState } from './agent-state.js';
import { isInteractive } from './interactive.js';
import { commands } from './commands/index.js';
import type { CommandHandlerDeps, Tab } from './types.js';

export function createCommandHandler(deps: CommandHandlerDeps): (cmd: string, targetIdx?: number) => void {
  return (cmd: string, targetIdx?: number) => {
    const trimmed = stripComments(cmd);
    // When a target tab is given (scheduled execution) run "as if typed" in that tab by
    // overriding the active-tab and its updater; otherwise act on the focused tab.
    const ctx = targetIdx === undefined
      ? deps
      : { ...deps, activeTab: targetIdx, updateCurrentTab: (u: (tab: Tab) => Tab) => deps.updateTab(targetIdx, u) };
    const { tabs, activeTab, updateCurrentTab, setAgentStates } = ctx;
    const curTab = tabs[activeTab];
    const newHistory = curTab && curTab.cmdHistory[curTab.cmdHistory.length - 1] !== trimmed
      ? [...curTab.cmdHistory, trimmed].slice(-100)
      : curTab?.cmdHistory ?? [];

    updateCurrentTab((tab) => {
      if (tab.cmdHistory[tab.cmdHistory.length - 1] === trimmed) return { ...tab, cmdHistoryIdx: -1 };
      return { ...tab, cmdHistory: newHistory, cmdHistoryIdx: -1 };
    });

    if (curTab && newHistory !== curTab.cmdHistory) {
      setAgentStates((prev) => {
        const cur = prev[curTab.label];
        if (!cur) return prev;
        const updated = { ...cur, cmdHistory: newHistory };
        try { saveAgentState(updated); } catch { /* ignore */ }
        return { ...prev, [curTab.label]: updated };
      });
    }

    const res = resolveCommand(trimmed);

    if (res.kind === 'empty') return;

    if (res.kind === 'shell') {
      const tabLabel = tabs[activeTab].label;
      if (res.cmd && isInteractive(res.cmd)) {
        ctx.setInteractive({ cmd: res.cmd, cwd: ctx.cwdRef.current[tabLabel] ?? process.cwd() });
        return;
      }
      ctx.runShellInTab(activeTab, tabLabel, res.cmd);
      return;
    }

    if (res.kind === 'output') {
      updateCurrentTab((tab) => (
        { ...tab, log: [...tab.log, { input: trimmed, output: res.output }], scrollOffset: 0 }
      ));
      return;
    }

    const command = commands.find((c) => c.name === res.name);
    if (command) {
      command.handler(res.cmd, ctx);
    }
  };
}
