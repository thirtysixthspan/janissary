import type { Command } from './types.js';

// Behavior lives in the Controller (`runAcp`), which owns the per-tab ACP session, response
// streaming, and the browser/db tool loop. This is the registry descriptor for command resolution.
export const command: Command = {
  name: 'acp',
  match: (command_) => /^acp\b/i.test(command_),
};
