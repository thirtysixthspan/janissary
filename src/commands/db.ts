import type { Command } from './types.js';

export const command: Command = {
  name: 'db',
  match: (cmd) => /^db\b/i.test(cmd),
  handler: (cmd, ctx) => {
    const { updateCurrentTab, tabs, activeTab, runDbInTab } = ctx;
    const tabLabel = tabs[activeTab].label;
    const output = runDbInTab(tabLabel, cmd);
    updateCurrentTab((tab) => ({ ...tab, log: [...tab.log, { input: cmd, output }], scrollOffset: 0 }));
  },
};
