import type { Command } from './types.js';

export const command: Command = {
  name: 'browser',
  match: (command_) => /^browser\b/i.test(command_),
  handler: (command_, context) => {
    const { tabs, activeTab, appendLog, finishRunning, setAgentActive, runBrowserInTab } = context;
    const tabLabel = tabs[activeTab].label;
    const tabIndex = activeTab;
    appendLog(tabLabel, { input: command_, output: '', running: true });
    setAgentActive(tabLabel, true);
    void (async () => {
      const output = await runBrowserInTab(tabIndex, command_);
      finishRunning(tabLabel, output);
      setAgentActive(tabLabel, false);
    })();
  },
};
