import { randomUUID } from 'node:crypto';
import type { Command } from './types.js';
import { acpAvailable } from '../acp/availability.js';
import { appendAcp } from '../acp/response.js';

export const command: Command = {
  name: 'ask-reset',
  available: acpAvailable,
  coreResponse: true,
  match: (command_) => /^ask\s+reset\b/i.test(command_),
  samples: ['ask reset', 'ask reset bob'],
  run: (command, tab, managers, invocation) => {
    const hadSession = managers.acp.close(tab.label);
    appendAcp(managers, tab.label, {
      input: invocation?.line ?? command,
      background: randomUUID(),
      output: hadSession
        ? 'ACP session reset — next ask prompt will start fresh.'
        : 'No active ACP session to reset.',
    });
  },
};
