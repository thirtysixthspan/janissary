import type { Command } from './types.js';
import { acpAvailable } from '../acp/availability.js';
import { runAcpCommand } from '../acp/response.js';

export const command: Command = {
  name: 'ask',
  available: acpAvailable,
  coreResponse: true,
  match: (command_) => /^ask\b/i.test(command_),
  samples: ['ask', 'ask bob'],
  run: (command, tab, managers, invocation) => runAcpCommand(command, tab, managers, invocation, 'ask'),
};
