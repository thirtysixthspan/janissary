import type { Command } from './types.js';
import { acpAvailable } from '../acp/availability.js';
import { runAcpCommand } from '../acp/response.js';

export const command: Command = {
  name: 'tell',
  available: acpAvailable,
  coreResponse: true,
  match: (command_) => /^tell\b/i.test(command_),
  samples: ['tell', 'tell hello'],
  run: (command, tab, managers, invocation) => runAcpCommand(command, tab, managers, invocation, 'tell'),
};
