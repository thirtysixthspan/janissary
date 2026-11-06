import { randomUUID } from 'node:crypto';
import type { Command } from './types.js';
import { acpAvailable } from '../acp/availability.js';
import { appendAcp } from '../acp/response.js';

export const command: Command = {
  name: 'tell-reset',
  available: acpAvailable,
  coreResponse: true,
  match: (command_) => /^tell\s+reset\b/i.test(command_),
  samples: ['tell reset', 'tell reset extra'],
  run: (command, tab, managers, invocation) => {
    const hadSession = managers.acp.close(tab.label, undefined, 'tell');
    appendAcp(managers, tab.label, {
      input: invocation?.line ?? command,
      background: randomUUID(),
      output: hadSession
        ? 'ACP tell session reset — next tell prompt will start fresh.'
        : 'No active ACP tell session to reset.',
    });
  },
};
