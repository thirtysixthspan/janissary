import type { Command } from './types.js';

export const command: Command = {
  name: 'next',
  match: (command_) => command_.toLowerCase() === 'next',
  run: (_command, context, managers) => {
    managers.tab.setActiveTab((managers.tab.activeTab + 1) % managers.tab.tabs.length);
  },
};
