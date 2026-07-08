import type { Command } from './types.js';

export const command: Command = {
  name: 'queue',
  match: (command_) => command_.toLowerCase() === 'queue',
  // The queue picker is interactive (client-side, Cmd+E); reaching the server non-interactively
  // (e.g. via a scheduled dispatch) is a no-op.
  run: () => { /* no-op on the server */ },
};
