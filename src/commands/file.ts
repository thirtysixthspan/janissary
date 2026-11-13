import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';
import { readFileInTab } from '../file-read/tab-read.js';

export const command: Command = {
  name: 'file',
  match: (command_) => /^file\b/i.test(command_),
  samples: ['file', 'file read README.md', 'file read src/a.ts --offset 10 --limit 5'],
  run: async (command_, tab, managers, invocation) => {
    const output = await readFileInTab(managers, tab.label, command_);
    appendCommandOutput(managers, tab.label, { input: command_, output }, invocation);
  },
};
