import type { Command } from './types.js';
import { appendCommandOutput } from '../command/append.js';
import { isWebCommandLine } from '../web/command-line.js';
import { runWebInTab } from '../web/tab-web.js';

export const command: Command = {
  name: 'web',
  match: isWebCommandLine,
  samples: [
    'web',
    'web search node.js permission model 2026',
    'web search rust async --results 5 --depth advanced',
    'web fetch https://nodejs.org/api/permissions.html --max-chars 5000',
  ],
  run: async (command_, tab, managers, invocation) => {
    const output = await runWebInTab(managers, tab.label, command_);
    appendCommandOutput(managers, tab.label, { input: command_, output }, invocation);
  },
};
