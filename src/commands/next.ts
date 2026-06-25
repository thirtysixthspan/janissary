import type { Command } from './types.js';

export const command: Command = {
  name: 'next',
  match: (command_) => command_.toLowerCase() === 'next',
  handler: (_command, context) => {
    context.setActiveTab((context.activeTab + 1) % context.tabs.length);
  },
};
