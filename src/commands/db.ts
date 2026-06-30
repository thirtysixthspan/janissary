import type { Command } from './types.js';

export const command: Command = {
  name: 'db',
  match: (command_) => /^db\b/i.test(command_),
  run: (command_, context) => { context.out(context.runDb(command_)); },
};
