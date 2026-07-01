import type { Command } from './types.js';

export const command: Command = {
  name: 'acp',
  match: (command_) => /^acp\b/i.test(command_),
  run: (command, tab, managers) => { managers.acp.run(tab.label, command); },
};
