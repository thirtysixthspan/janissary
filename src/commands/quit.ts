import type { Command } from './types.js';
import { messageBus } from '../bus.js';

export const command: Command = {
  name: 'quit',
  match: (command_) => {
    const lower = command_.toLowerCase();
    return lower === 'quit' || lower === 'exit';
  },
  run: () => { messageBus.emit('app', { type: 'exit' }); },
};
