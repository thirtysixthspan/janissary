import type { Command } from './types.js';

export const command: Command = {
  name: 'browser',
  match: (command_) => /^browser\b/i.test(command_),
  samples: ['browser', 'browser open example.com'],
  run: (command, tab, managers, invocation) => {
    if (invocation?.acpTool) return managers.browser.run(tab.label, command);
    managers.browser.runInteractive(command, tab.label);
  },
};
