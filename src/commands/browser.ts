import type { Command } from './types.js';

// Behavior lives in the Controller (`runBrowser`), which owns the per-tab Playwright browser and the
// async running-entry lifecycle. This is the registry descriptor used for command resolution.
export const command: Command = {
  name: 'browser',
  match: (command_) => /^browser\b/i.test(command_),
};
