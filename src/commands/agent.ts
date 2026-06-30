import type { Command } from './types.js';

// Behavior lives in the Controller (`newAgent`), which owns tab creation, color allocation, the
// cwd/workspace maps, and persistence. This is the registry descriptor used for command resolution.
export const command: Command = {
  name: 'agent',
  match: (command_) => /^agent\b/i.test(command_),
};
