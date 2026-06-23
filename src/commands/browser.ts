import type { Command } from './types.js';

export const command: Command = {
  name: 'browser',
  match: (cmd) => /^browser\b/i.test(cmd),
  handler: (cmd, ctx) => {
    const { tabs, activeTab, appendLog, finishRunning, setAgentActive, runBrowserInTab } = ctx;
    const tabLabel = tabs[activeTab].label;
    const tabIndex = activeTab;
    appendLog(tabLabel, { input: cmd, output: '', running: true });
    setAgentActive(tabLabel, true);
    void (async () => {
      const output = await runBrowserInTab(tabIndex, cmd);
      finishRunning(tabLabel, output);
      setAgentActive(tabLabel, false);
    })();
  },
};
