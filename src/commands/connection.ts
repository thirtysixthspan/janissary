import type { Command } from './types.js';

export const command: Command = {
  name: 'connection',
  match: (command_) => /^connection\b/i.test(command_),
  run: (command, tab, managers) => { managers.connection.run(command, tab.label); },
};
