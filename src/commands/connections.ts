import type { Command } from './types.js';

export const command: Command = {
  name: 'connections',
  match: (command_) => /^connections\b/i.test(command_),
  samples: ['connections list', 'connections close acp'],
  run: (command, tab, managers, invocation) => managers.connection.run(command, tab.label, invocation),
};
