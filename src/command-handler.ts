import { stripComments } from './tab.js';
import { resolveCommand } from './resolve.js';
import { saveAgentState } from './agent-state.js';
import { isInteractive } from './interactive.js';
import { commands } from './commands/index.js';
import type { CommandHandlerContext } from './commands/index.js';

export type CommandHandlerDeps = CommandHandlerContext;

export function createCommandHandler(deps: CommandHandlerDeps): (cmd: string) => void {
  return (cmd: string) => {
    const trimmed = stripComments(cmd);
    const { tabs, activeTab, updateCurrentTab, setAgentStates } = deps;
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
        deps.setInteractive({ cmd: res.cmd, cwd: deps.cwdRef.current[tabLabel] ?? process.cwd() });
        return;
      }
      deps.runShellInTab(activeTab, tabLabel, res.cmd);
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
      command.handler(res.cmd, deps);
    }
  };
}
