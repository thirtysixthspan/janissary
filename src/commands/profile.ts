import type { Command } from './types.js';

// Behavior lives in the Controller (`runProfile`), which opens a tab per profile agent and shares a
// group color across them. This is the registry descriptor used for command resolution.
export const command: Command = {
  name: 'profile',
  match: (command_) => /^profile\b/i.test(command_),
};
