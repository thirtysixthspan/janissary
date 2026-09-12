import type { Command } from './types.js';

export const command: Command = {
  name: 'connection',
  match: (command_) => /^connection\b/i.test(command_),
  samples: ['connection', 'connection close acp'],
  run: (command, tab, managers) => { managers.connection.run(command, tab.label); },
};
