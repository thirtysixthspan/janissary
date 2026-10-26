import type { Command } from './types.js';

export const command: Command = {
  name: 'clipboard',
  match: (command_) => command_.toLowerCase() === 'clipboard',
  samples: ['clipboard'],
  // The clipboard-history popup is interactive (client-side, Ctrl+Shift+V); reaching the server
  // non-interactively (e.g. via a scheduled dispatch or an agent message) is a no-op, exactly as
  // `hist` is.
  run: () => { /* no-op on the server */ },
};
