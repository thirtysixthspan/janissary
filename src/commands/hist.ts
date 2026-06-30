import type { Command } from './types.js';

export const command: Command = {
  name: 'hist',
  match: (command_) => command_.toLowerCase() === 'hist',
  // The history picker is interactive (client-side, Ctrl+R); reaching the server non-interactively
  // (e.g. via a scheduled dispatch) is a no-op.
  run: () => { /* no-op on the server */ },
};
