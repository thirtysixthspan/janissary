import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';
import { isWebCommandLine } from '../web-search/command.js';
import { searchWebInTab } from '../web-search/tab-search.js';

export const command: Command = {
  name: 'web',
  match: isWebCommandLine,
  samples: [
    'web',
    'web search node.js permission model 2026',
    'web search rust async --results 5 --depth advanced',
  ],
  run: async (command_, tab, managers, invocation) => {
    const output = await searchWebInTab(managers, tab.label, command_);
    appendCommandOutput(managers, tab.label, { input: command_, output }, invocation);
  },
};
