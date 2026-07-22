import type { Command } from './types.js';

export const command: Command = {
  name: 'newdir',
  match: (command_) => /^newdir\b/i.test(command_),
  run: (command, tab, managers) => {
    const target = command.replace(/^newdir\b\s*/i, '').trim();
    if (!target) { managers.tab.append(tab.label, { input: command, output: 'Usage: newdir <directory>' }); return; }
    managers.tab.append(tab.label, { input: command, output: '' });
    managers.openFile.newDirectory(target, tab.label);
  },
};
