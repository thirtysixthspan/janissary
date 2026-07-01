import type { Command } from './types.js';

export const command: Command = {
  name: 'profile',
  match: (command_) => /^profile\b/i.test(command_),
  run: (command, tab, managers) => { managers.profile.run(command, tab.label); },
};
