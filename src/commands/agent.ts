import type { Command } from './types.js';

export const command: Command = {
  name: 'agent',
  match: (command_) => /^agent\b/i.test(command_),
  samples: ['agent', 'agent bob'],
  run: (command, context, managers) => { managers.profile.newAgent(command); },
};
