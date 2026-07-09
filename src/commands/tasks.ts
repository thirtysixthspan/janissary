import type { Command } from './types.js';

export const command: Command = {
  name: 'tasks',
  match: (command_) => command_.toLowerCase() === 'tasks',
  // The task picker is interactive (client-side, Ctrl+A); reaching the server non-interactively
  // (e.g. via a scheduled dispatch) is a no-op.
  run: () => { /* no-op on the server */ },
};
