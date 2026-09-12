import type { Command } from './types.js';

export const command: Command = {
  name: 'acp',
  match: (command_) => /^acp\b/i.test(command_),
  samples: ['acp', 'acp bob'],
  run: (command, tab, managers) => { managers.acp.run(tab.label, command); },
};
