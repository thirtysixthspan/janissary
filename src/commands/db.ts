import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';

export const command: Command = {
  name: 'db',
  match: (command_) => /^db\b/i.test(command_),
  samples: ['db', 'db open notes'],
  run: (command_, tab, managers, invocation) => {
    appendCommandOutput(managers, tab.label, { input: command_, output: managers.database.runInTab(tab.label, command_) }, invocation);
  },
};
