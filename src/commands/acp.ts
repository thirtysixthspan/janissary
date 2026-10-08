import type { Command } from './types.js';
import { acpAvailable } from '../acp/availability.js';

export const command: Command = {
  name: 'acp',
  available: acpAvailable,
  coreResponse: true,
  match: (command_) => /^acp\b/i.test(command_),
  samples: ['acp', 'acp bob'],
  run: async (command, tab, managers) => { await managers.acp.prompt(tab.label, command); },
  capture: (command, label, managers, reply) => { void managers.acp.prompt(label, command).then(reply); },
};
