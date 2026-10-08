import type { Command } from './types.js';
import { acpAvailable } from '../acp/availability.js';
import { appendAcp } from '../acp/response.js';

export const command: Command = {
  name: 'acp-reset',
  available: acpAvailable,
  coreResponse: true,
  match: (command_) => /^acp\s+reset\b/i.test(command_),
  samples: ['acp reset', 'acp reset bob'],
  run: (_command, tab, managers) => {
    const hadSession = managers.acp.close(tab.label);
    appendAcp(managers, tab.label, {
      input: _command,
      output: hadSession
        ? 'ACP session reset — next acp prompt will start fresh.'
        : 'No active ACP session to reset.',
    });
  },
};
