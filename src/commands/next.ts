import type { Command } from './types.js';

export const command: Command = {
  name: 'next',
  match: (cmd) => cmd.toLowerCase() === 'next',
  handler: (_cmd, ctx) => {
    ctx.setActiveTab((ctx.activeTab + 1) % ctx.tabs.length);
  },
};
