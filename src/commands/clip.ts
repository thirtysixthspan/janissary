import type { Command } from './types.js';

export const command: Command = {
  name: 'clip',
  match: (command_) => command_.toLowerCase() === 'clip',
  samples: ['clip'],
  // The clipboard-history popup is interactive (client-side, Ctrl+Shift+V); reaching the server
  // non-interactively (e.g. via a scheduled dispatch or an agent message) is a no-op, exactly as
  // `hist` is.
  run: () => { /* no-op on the server */ },
};
