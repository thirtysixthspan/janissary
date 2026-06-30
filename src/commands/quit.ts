import type { Command } from './types.js';

export const command: Command = {
  name: 'quit',
  match: (command_) => {
    const lower = command_.toLowerCase();
    return lower === 'quit' || lower === 'exit';
  },
  // The Controller owns resource teardown (it kills every tab's shell/ACP/browser/PTY in `shutdown`);
  // the command just asks the host to exit.
  run: (_command, context) => { context.exit(); },
};
