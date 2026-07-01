import type { Command } from './types.js';
import { messageBus } from '../bus.js';

export const command: Command = {
  name: 'quit',
  match: (command_) => command_.trim().toLowerCase() === 'quit',
  run: () => { messageBus.emit('app', { type: 'exit' }); },
};
