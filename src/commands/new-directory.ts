import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';

export const command: Command = {
  name: 'newdir',
  match: (command_) => /^newdir\b/i.test(command_),
  samples: ['newdir', 'newdir notes'],
  run: (command, tab, managers, invocation) => {
    const target = command.replace(/^newdir\b\s*/i, '').trim();
    if (!target) { appendCommandOutput(managers, tab.label, { input: command, output: 'Usage: newdir <directory>' }, invocation); return; }
    appendCommandOutput(managers, tab.label, { input: command, output: '' }, invocation);
    managers.openFile.newDirectory(target, tab.label);
  },
};
