import type { Command } from './types.js';

export const command: Command = {
  name: 'shell',
  match: (input) => input.startsWith('!'),
  samples: ['!ps', '! git status'],
  run: (input, tab, managers) => {
    managers.shell.run(tab.label, input.slice(1).replace(/^\s+/, ''));
  },
};
