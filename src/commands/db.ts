import type { Command } from './types.js';

export const command: Command = {
  name: 'db',
  match: (command_) => /^db\b/i.test(command_),
  handler: (command_, context) => {
    const { updateCurrentTab, tabs, activeTab, runDbInTab } = context;
    const tabLabel = tabs[activeTab].label;
    const output = runDbInTab(tabLabel, command_);
    updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: command_, output }], scrollOffset: 0 }));
  },
};
