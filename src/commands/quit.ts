import type { Command } from './types.js';
import { messageBus } from '../bus.js';
import { normalizeCommandName } from '../shared/command-matching.js';

export const command: Command = {
  name: 'quit',
  match: (command_) => normalizeCommandName(command_) === 'quit',
  samples: ['quit'],
  run: () => { messageBus.emit('app', { type: 'exit' }); },
};
