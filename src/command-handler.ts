import { stripComments } from './tab.js';
import { resolveCommand } from './resolve.js';
import { saveAgentState } from './agent-state.js';
import { isInteractive } from './interactive.js';
import { commands } from './commands/index.js';
import { analyzeCommand, routeChoices, toPrefixedCommand } from './recognizers/index.js';
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

    // Resolve and run a command. Factored out so a recognized-but-unprefixed command can be
    // re-dispatched in its explicit form without recording history a second time.
    const dispatch = (input: string): void => {
      const res = resolveCommand(input);

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
          { ...tab, log: [...tab.log, { input, output: res.output }], scrollOffset: 0 }
        ));
        return;
      }

      // An unprefixed, non-built-in command: run probabilistic recognition to find its route.
      if (res.kind === 'unknown') {
        const openDbs = ctx.getOpenDbs(curTab?.label ?? '');
        const decision = analyzeCommand(res.cmd, { openDbs });
        if (decision.kind === 'route') {
          // A db route needs exactly one target connection; otherwise let the user pick.
          if (decision.route === 'db' && openDbs.length !== 1) {
            ctx.openRouteChooser(res.cmd, routeChoices(openDbs));
            return;
          }
          const choice = decision.route === 'db'
            ? { label: '', route: 'db' as const, dbName: openDbs[0] }
            : { label: '', route: decision.route };
          dispatch(toPrefixedCommand(res.cmd, choice));
          return;
        }
        // Not confident enough — force the user to choose the route.
        ctx.openRouteChooser(res.cmd, routeChoices(openDbs));
        return;
      }

      const command = commands.find((c) => c.name === res.name);
      if (command) {
        command.handler(res.cmd, ctx);
      }
    };

    dispatch(trimmed);
  };
}
