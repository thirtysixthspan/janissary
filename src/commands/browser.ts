import type { Command } from './types.js';

export const command: Command = {
  name: 'browser',
  match: (command_) => /^browser\b/i.test(command_),
  samples: ['browser', 'browser open example.com'],
  run: (command, tab, managers) => { managers.browser.runInteractive(command, tab.label); },
  capture: (command, label, managers, reply) => { managers.browser.runInteractive(command, label, reply); },
};
