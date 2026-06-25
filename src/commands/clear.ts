import type { Command } from './types.js';

export const command: Command = {
  name: 'clear',
  match: (command_) => command_.toLowerCase() === 'clear',
  handler: (_command, context) => {
    context.updateCurrentTab((tab) => ({ ...tab, log: [], scrollOffset: 0 }));
  },
};
