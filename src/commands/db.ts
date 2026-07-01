import type { Command } from './types.js';

export const command: Command = {
  name: 'db',
  match: (command_) => /^db\b/i.test(command_),
  run: (command_, tab, managers) => { managers.tab.append(tab.label, { input: command_, output: managers.database.runInTab(tab.label, command_) }); },
};
