import type { Command } from './types.js';

export const command: Command = {
  name: 'clear',
  match: (command_) => command_.toLowerCase() === 'clear',
  run: (_command, tab, managers) => { managers.tab.clearTranscript(tab.label); },
};
