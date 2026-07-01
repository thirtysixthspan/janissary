import type { Command } from './types.js';

export const command: Command = {
  name: 'browser',
  match: (command_) => /^browser\b/i.test(command_),
  run: (command, tab, managers) => { managers.browser.runInteractive(command, tab.label); },
};
