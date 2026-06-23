import type { Command } from './types.js';

export const command: Command = {
  name: 'clear',
  match: (cmd) => cmd.toLowerCase() === 'clear',
  handler: (_cmd, ctx) => {
    ctx.updateCurrentTab((tab) => ({ ...tab, log: [], scrollOffset: 0 }));
  },
};
