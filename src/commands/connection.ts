import type { Command } from './types.js';

// Behavior lives in the Controller (`runConnection`), which reaches across a tab's shell, ACP
// session, browser windows, terminals, and SQLite connections. Registry descriptor only.
export const command: Command = {
  name: 'connection',
  match: (command_) => /^connection\b/i.test(command_),
};
